const Attendance = require('../models/attendanceSchema');
const catchAsync = require('../utils/catchAsync');
const factory = require('./handlerFactory');
const multer = require('multer');
const sharp = require('sharp');
const fs = require('fs');
const path = require('path');
const AppError = require('../utils/appError'); // make sure this exists
const mongoose = require("mongoose");

// ✅ FOLDERS
const uploadDir = path.join(__dirname, "../public/img/attendance");
const tempDir = path.join(__dirname, "../public/img/temp");

// ✅ ENSURE FOLDERS EXIST
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

if (!fs.existsSync(tempDir)) {
  fs.mkdirSync(tempDir, { recursive: true });
}

// ✅ MULTER STORAGE (TEMP)
const multerStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, tempDir);
  },
  filename: (req, file, cb) => {
    cb(null, `temp-${Date.now()}-${Math.random()}.jpeg`);
  },
});

// ✅ FILE FILTER
const multerFilter = (req, file, cb) => {
  if (file.mimetype.startsWith("image")) {
    cb(null, true);
  } else {
    cb(new AppError("Only images allowed!", 400), false);
  }
};

// ✅ UPLOAD
const upload = multer({
  storage: multerStorage,
  fileFilter: multerFilter,
  limits: { fileSize: 5 * 1024 * 1024 },
});

// ✅ EXPORT (COMMON FOR CHECKIN + CHECKOUT)
exports.uploadAttendancePhoto = upload.single("image");


// ✅ ✅ FIXED SAFE DELETE (WINDOWS EPERM HANDLED)
const deleteFileSafe = (filePath) => {
  if (!filePath) return;

  const tryDelete = (retry = 0) => {
    // 🔒 If already deleted
    if (!fs.existsSync(filePath)) return;

    fs.unlink(filePath, (err) => {
      if (!err) {
        console.log("🧹 Temp deleted:", filePath);
        return;
      }

      // 🔥 HANDLE WINDOWS LOCK ISSUE
      if (err.code === "EPERM" || err.code === "EBUSY") {
        if (retry < 5) {
          console.log(`🔁 Retry delete (${retry + 1})...`);
          return setTimeout(() => tryDelete(retry + 1), 1000);
        }
      }

      // ❌ FINAL FAIL (only log, no crash)
      console.error("❌ Delete failed:", err.message);
    });
  };

  tryDelete();
};


// ✅ RESIZE + COMPRESS (DYNAMIC FOR CHECKIN / CHECKOUT)
exports.resizeAttendancePhoto = catchAsync(async (req, res, next) => {
  if (!req.file) return next();

  const tempPath = req.file.path;

  try {
    // ✅ DETECT API TYPE
    const type = req.originalUrl.includes("checkOut")
      ? "checkout"
      : "checkin";

    const filename = `${type}-${Date.now()}-${Math.random()}.jpeg`;
    const outputPath = path.join(uploadDir, filename);

    await sharp(tempPath)
      .resize({ width: 800 })
      .jpeg({ quality: 60 })
      .toFile(outputPath);

    // ✅ SAFE DELETE (with retry)
    deleteFileSafe(tempPath);

    // ✅ PASS TO CONTROLLER
    req.body.fileName = filename;

    next();
  } catch (err) {
    // ✅ DELETE EVEN IF ERROR
    deleteFileSafe(tempPath);

    return next(new AppError("Image processing failed", 400));
  }
});

exports.checkIn = catchAsync(async (req, res, next) => {
  try {
    const driver = req.user._id;
    const vehicle = req.body.vehicleId;
    const startKM = Number(req.body.startKM);
    const dieselInReading = Number(req.body.dieselInReading);
    const meterPhoto = req.body.fileName;
    const store = req.user.store[0]._id;
    const startTime = new Date();

    // 🔥 FORCE FLAG FIX
    const force = String(req.body.force) === "true";

    // ✅ BASIC VALIDATIONS
    if (!driver) {
      return res.status(400).json({ message: "Driver is required!" });
    }

    if (!vehicle) {
      return res.status(400).json({ message: "Vehicle is required!" });
    }

    if (!mongoose.Types.ObjectId.isValid(vehicle)) {
      return res.status(400).json({
        message: "Invalid vehicle selected!",
      });
    }

    if (!startKM) {
      return res.status(400).json({ message: "Start KM is required!" });
    }

    if (!dieselInReading) {
      return res.status(400).json({
        message: "Diesel reading is required!",
      });
    }

    if (!meterPhoto) {
      return res.status(400).json({ message: "Meter photo is required!" });
    }

    // 🔥 STEP 1: LAST CHECKOUT VALIDATION (LIKE CHECKOUT LOGIC)
    const lastRecord = await Attendance.findOne({
      vehicle,
      status: "checkOut",
    }).sort({ endTime: -1 });

    if (lastRecord && startKM <= Number(lastRecord.endKM)) {
      return res.status(400).json({
        success: false,
        message: `Start HMR (${startKM}) should be greater than last checkout HMR (${lastRecord.endKM})`,
      });
    }

    // 🔥 STEP 2: CHECK RUNNING VEHICLE
    const runningRecord = await Attendance.findOne({
      vehicle,
      status: "checkIn",
    });

    // 🔥 STEP 3: HANDLE OTHER USER RUNNING
    if (
      runningRecord &&
      runningRecord.driver.toString() !== driver.toString()
    ) {
      if (!force) {
        return res.status(409).json({
          success: false,
          message: "Vehicle already running by another operator",
          requireForce: true,
        });
      }

      // 🔥 FORCE → AUTO CHECKOUT OLD USER
      runningRecord.endTime = new Date();
      runningRecord.endKM = startKM;
      runningRecord.dieselOutReading = dieselInReading;
      runningRecord.status = "checkOut";

      await runningRecord.save();
    }

    // 🔥 STEP 4: PREVENT SAME USER DOUBLE CHECK-IN
    const existing = await Attendance.findOne({
      driver,
      vehicle,
      status: "checkIn",
    });

    if (existing) {
      return res.status(400).json({
        success: false,
        message: "You are already checked-in on this vehicle",
      });
    }

    // 🔥 STEP 5: CREATE NEW CHECK-IN
    const attendance = await Attendance.create({
      driver,
      vehicle,
      store,
      startTime,
      startKM,
      desile: [
        {
          dieselInReading: dieselInReading,
        },
      ],
      meterPhotos: {
        start: meterPhoto,
      },
      status: "checkIn",
    });

    res.status(201).json({
      success: true,
      message: "Check-in successful.",
      data: attendance,
    });

  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});


exports.checkOut = catchAsync(async (req, res, next) => {
  try {
    const endTime = new Date();
    const meterPhoto = req.body.fileName;
    const driverId = req.user._id;

    const { endKM, attendanceId, dieselOutReading } = req.body;

    // ✅ VALIDATIONS
    if (!attendanceId) {
      return res.status(400).json({
        success: false,
        message: "Attendance ID आवश्यक है",
      });
    }

    if (!endKM) {
      return res.status(400).json({
        success: false,
        message: "अंतिम HMR आवश्यक है",
      });
    }

    if (!dieselOutReading) {
      return res.status(400).json({
        success: false,
        message: "अंतिम डीज़ल रीडिंग आवश्यक है",
      });
    }

    if (!meterPhoto) {
      return res.status(400).json({
        success: false,
        message: "मीटर की फोटो आवश्यक है",
      });
    }

    // ✅ FIND ATTENDANCE
    const attendance = await Attendance.findById(attendanceId);

    if (!attendance) {
      return res.status(404).json({
        success: false,
        message: "Attendance record नहीं मिला",
      });
    }

    // ✅ DRIVER SECURITY CHECK (FIXED)
    const attendanceDriverId = attendance.driver._id
      ? attendance.driver._id.toString()
      : attendance.driver.toString();

    if (attendanceDriverId !== driverId.toString()) {
      return res.status(403).json({
        success: false,
        message: "Unauthorized access",
      });
    }

    // ✅ ALREADY CHECKED OUT
    if (attendance.status === "checkOut") {
      return res.status(400).json({
        success: false,
        message: "यह वाहन पहले ही चेकआउट हो चुका है",
      });
    }

    // ✅ STRICT KM VALIDATION
    if (Number(endKM) <= Number(attendance.startKM)) {

      // 🔥 SAFE DELETE (NO EPERM ERROR)
      if (req.file) {
        setTimeout(() => {
          fs.unlink(req.file.path, (err) => {
            if (err) console.error("Delete failed:", err.message);
          });
        }, 500);
      }

      return res.status(400).json({
        success: false,
        message: "चेकआउट HMR, चेकइन HMR से अधिक होना चाहिए",
      });
    }

    // ✅ UPDATE RECORD
    attendance.endTime = endTime;
    attendance.endKM = Number(endKM); // 🔥 FIX
    attendance.dieselOutReading = Number(dieselOutReading); // 🔥 FIX
    attendance.meterPhotos.end = meterPhoto;
    attendance.status = "checkOut";

    await attendance.save();

    res.status(200).json({
      success: true,
      message: "चेकआउट सफल रहा।",
      data: attendance,
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

exports.addDieselFillUp = async (req, res) => {
  try {
    const { desileQty, reading } = req.body;

    const driver = req.user._id

    // Check if the driver has already checked in for the day
    const todayStart = new Date().setHours(0, 0, 0, 0);
    const todayEnd = new Date().setHours(23, 59, 59, 999);


    // Find the active check-in record for today
    const attendance = await Attendance.findOne({
      driver,
      status: "checkIn",
      startTime: { $gte: todayStart, $lte: todayEnd },
    });

    if (!attendance) {
      return res.status(400).json({ message: "ड्राइवर ने आज चेकइन नहीं किया है, कृपया पहले चेकइन करें।" });
    }

    // Add diesel entry
    attendance.desile.push({
      desileQty,
      reading,
      diseleFilupDate: new Date(),
    });

    await attendance.save();
    res.status(200).json({ message: "डीज़ल सफलतापूर्वक भरा गया।", attendance });
  } catch (error) {
    res.status(500).json({ message: "Server Error", error: error.message });
  }
};


exports.updateAttendanceById = catchAsync(async (req, res, next) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    // Find the attendance record
    const attendance = await Attendance.findById(id);

    if (!attendance) {
      return res.status(404).json({
        success: false,
        message: "Attendance record not found.",
      });
    }

    // Update fields
    if (updates.startTime) attendance.startTime = updates.startTime;
    if (updates.startKM) attendance.startKM = updates.startKM;
    if (updates.endTime) attendance.endTime = updates.endTime;
    if (updates.endKM) attendance.endKM = updates.endKM;
    if (updates.meterPhotoStart) attendance.meterPhotos.start = updates.meterPhotoStart;
    if (updates.meterPhotoEnd) attendance.meterPhotos.end = updates.meterPhotoEnd;

    await attendance.save();

    res.status(200).json({
      success: true,
      message: "Attendance updated successfully.",
      data: attendance,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
})


exports.getAttendanceById = factory.getOne(Attendance);
exports.deleteAttendanceById = factory.deleteOne(Attendance);

exports.getAttendanceByVehicle = catchAsync(async (req, res, next) => {
  try {
    const { vehicleId } = req.params;

    // Find attendance records by vehicle ID
    const attendances = await Attendance.find({ vehicle: vehicleId })
      .populate("driver", "name")
      .populate("vehicle", "name");

    if (!attendances.length) {
      return res.status(404).json({
        success: false,
        message: "No attendance records found for this vehicle.",
      });
    }

    res.status(200).json({
      success: true,
      data: attendances,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
})

exports.getAttendanceByDriver = catchAsync(async (req, res, next) => {
  try {

    const { driverId } = req.params;
    console.log(driverId)
    // Find attendance records by driver ID
    const attendances = await Attendance.find({ driver: driverId })
      .populate("driver", "name")
      .populate("vehicle", "name");
    console.log(attendances)

    if (!attendances.length) {
      return res.status(404).json({
        success: false,
        message: "No attendance records found for this driver.",
      });
    }

    res.status(200).json({
      success: true,
      data: attendances,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
})

exports.getMyAttendance = catchAsync(async (req, res, next) => {
  try {
    const user = req.user;

    // 🔥 FAST QUERY (NO AUTO POPULATE)
    const attendances = await Attendance.find({ driver: user._id })
      .setOptions({ skipPopulate: true })
      .select("startTime endTime startKM endKM status desile createdAt vehicle driver store")
      .sort({ createdAt: -1 })
      .lean();

    if (!attendances.length) {
      return res.status(404).json({
        success: false,
        message: "No attendance records found for this driver.",
      });
    }

    // 🔥 ONLY BASIC POPULATE (LIGHT)
    const populated = await Attendance.populate(attendances, [
      {
        path: "vehicle",
        select: "asset",
        populate: {
          path: "asset",
          select: "model equipmentNo masterItem store",
          populate: [
            { path: "masterItem", select: "description" },
            { path: "store", select: "name" }
          ]
        }
      },
      {
        path: "driver",
        select: "name store",
        populate: {
          path: "store",
          select: "name"
        }
      },
      {
        path: "store",
        select: "name"
      }
    ]);

    // 🔥 FORMAT
    const formatted = populated.map((item) => ({
      _id: item._id,
      startTime: item.startTime,
      endTime: item.endTime,
      startKM: item.startKM,
      endKM: item.endKM,
      status: item.status,
      desile: item.desile,
      createdAt: item.createdAt,

      vehicleName:
        item.vehicle?.asset?.masterItem?.description || "N/A",

      equipmentNo: item.vehicle?.asset?.equipmentNo || "",
      model: item.vehicle?.asset?.model || "",

      driverName: item.driver?.name || "",

      vehicleStore:
        item.vehicle?.asset?.store?.name || "N/A",

      driverStore:
        item.driver?.store?.length > 0
          ? item.driver.store.map((s) => s.name).join(", ")
          : "N/A",

      attendanceStore:
        item.store?.name || "N/A",
    }));

    res.status(200).json({
      success: true,
      data: formatted,
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

// Report Attendance


exports.getAttendenceByDate = async (req, res) => {
  try {
    const { fromDate, toDate, vehicle } = req.body;

    const from = fromDate ? new Date(fromDate) : new Date();
    const to = toDate ? new Date(toDate) : new Date();

    if (isNaN(from) || isNaN(to)) {
      return res.status(400).json({ status: "error", message: "Invalid Date Format" });
    }

    const startOfDay = new Date(from).setHours(0, 0, 0, 0);
    const endOfDay = new Date(to).setHours(23, 59, 59, 999);

    const query = {
      createdAt: { $gte: new Date(startOfDay), $lte: new Date(endOfDay) },
    };

    // Convert vehicle ID to ObjectId if it's not "all"
    if (vehicle && vehicle !== "all") {
      if (mongoose.Types.ObjectId.isValid(vehicle)) {
        query.vehicle = new mongoose.Types.ObjectId(vehicle);
      } else {
        return res.status(400).json({ status: "error", message: "Invalid Vehicle ID" });
      }
    }

    const items = await Attendance.find(query);
    const totalCount = await Attendance.countDocuments(query);

    return res.status(200).json({
      status: "success",
      data: items,
      count: totalCount,
    });
  } catch (error) {
    console.error("Error fetching items:", error);
    return res.status(500).json({
      status: "error",
      message: "An error occurred while fetching the items.",
    });
  }
};

// PDF report
exports.getAttendenceByDatePdf = async (req, res) => {
  try {
    const { fromDate, toDate, vehicle, store } = req.body;

    const from = fromDate ? new Date(fromDate) : new Date();
    const to = toDate ? new Date(toDate) : new Date();

    if (isNaN(from) || isNaN(to)) {
      return res.status(400).json({ status: "error", message: "Invalid Date Format" });
    }

    const startOfDay = new Date(from).setHours(0, 0, 0, 0);
    const endOfDay = new Date(to).setHours(23, 59, 59, 999);

    const query = {
      createdAt: { $gte: new Date(startOfDay), $lte: new Date(endOfDay) },
    };

    // Filter by vehicle if provided and not "all"
    if (vehicle && vehicle !== "all") {
      if (mongoose.Types.ObjectId.isValid(vehicle)) {
        query.vehicle = new mongoose.Types.ObjectId(vehicle);
      } else {
        return res.status(400).json({ status: "error", message: "Invalid Vehicle ID" });
      }
    }

    // Filter by store if provided and not "all"
    if (store && store !== "all") {
      if (mongoose.Types.ObjectId.isValid(store)) {
        query.store = new mongoose.Types.ObjectId(store);
      } else {
        return res.status(400).json({ status: "error", message: "Invalid Store ID" });
      }
    }

    const items = await Attendance.find(query);
    const totalCount = await Attendance.countDocuments(query);

    return res.status(200).json({
      status: "success",
      data: items,
      count: totalCount,
    });
  } catch (error) {
    console.error("Error fetching attendance:", error);
    return res.status(500).json({
      status: "error",
      message: "An error occurred while fetching the attendance records.",
    });
  }
};




