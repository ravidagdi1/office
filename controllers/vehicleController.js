const User = require('../models/userModel');
const Vehicle = require('../models/vehicleModel');
const catchAsync = require('../utils/catchAsync');
const factory = require('./handlerFactory');
const Store = require('../models/storeModel');
const Category = require('../models/vechileCatModel');
const AssetVehicle =require('../models/AssetVehicle');
const mongoose = require("mongoose");
const Attendance=require('../models/attendanceSchema');


exports.createVehicle = factory.createOne(Vehicle);

exports.getVehicleById = factory.getOne(Vehicle);
exports.getAllVehicle = factory.getAll(Vehicle);

exports.updateVehicleById = catchAsync(async (req, res) => {
  try {
    const { id } = req.params; // Vehicle ID
    console.log(req.body)
    const { assignedStore, driverIds } = req.body;

    // Validate inputs
    if (!assignedStore && (!driverIds || driverIds.length === 0)) {
      return res.status(400).json({
        success: false,
        message: 'You must provide a store ID or driver IDs to update.',
      });
    }

    // Find the vehicle to update
    const vehicle = await Vehicle.findById(id);
    if (!vehicle) {
      return res.status(404).json({
        success: false,
        message: 'Vehicle not found.',
      });
    }

    // Update the `assignedVehicles` field in the User schema
    if (driverIds) {
      // Find users currently assigned to this vehicle
      const currentDrivers = await User.find({ assignedVehicles: id });

      // Remove the vehicle from drivers no longer assigned
      const removedDrivers = currentDrivers.filter(
        (driver) => !driverIds.includes(driver._id.toString())
      );
      for (const driver of removedDrivers) {
        await User.findByIdAndUpdate(driver._id, { assignedVehicles: null });
      }

      // Assign the vehicle to the new drivers
      for (const driverId of driverIds) {
        await User.findByIdAndUpdate(driverId, { assignedVehicles: id });
      }
    }

    // Update the vehicle document
    const updatedVehicle = await Vehicle.findByIdAndUpdate(
      id,
      {
        ...req.body,
        ...(assignedStore && { assignedStore }),
        ...(driverIds && { assignedDrivers: driverIds }),
      },
      { new: true } // Return the updated document
    );

    res.status(200).json({
      status: 200,
      success: true,
      message: 'Vehicle updated successfully.',
      data: updatedVehicle,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});


// old //
exports.getVehiclesByStore = catchAsync(async (req, res, next) => {
  try {
    const { storeId } = req.params; // Extract store ID from request params

    console.log(storeId)

    if (!storeId) {
      return res.status(400).json({
        success: false,
        message: 'Store ID is required.',
      });
    }

    // Find all vehicles assigned to the specified store
    const vehicles = await Vehicle.find({ assignedStore: storeId })
      .populate('assignedDrivers', 'name email') // Populate driver details if needed
      .populate('assignedStore', 'name location'); // Populate store details if needed

    if (!vehicles || vehicles.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'No vehicles found for the specified store.',
      });
    }

    // Respond with the list of vehicles
    res.status(200).json({
      success: true,
      message: 'Vehicles retrieved successfully.',
      data: vehicles,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// new //



exports.getAssetVehiclesByStore = catchAsync(async (req, res, next) => {
  try {
    const { storeId } = req.params;
    const userId = req.user._id;

    if (!storeId) {
      return res.status(400).json({
        success: false,
        message: "Store ID is required.",
      });
    }

    const storeObjectId = new mongoose.Types.ObjectId(storeId);

    // 🔥 STEP 1: GET VEHICLES ASSIGNED TO CURRENT USER
    const vehicles = await AssetVehicle.find({
      isActive: true,
      operators: userId,
    })
      .select("_id asset capacity average vehicleType operators")
      .populate({
        path: "asset",
        match: { store: storeObjectId }, // only same store
        select: "model equipmentNo masterItem store",
        populate: [
          { path: "masterItem", select: "description" },
          { path: "store", select: "name" },
        ],
      })
      .lean();

    // 🔥 STEP 2: FILTER ONLY VEHICLES WITH MATCHED STORE
    const filtered = vehicles.filter((v) => v.asset);

    // 🔥 STEP 3: GET ONLY CURRENT USER RUNNING VEHICLES
    const myRunningAttendance = await Attendance.find({
      status: "checkIn",
      store: storeObjectId,
      driver: userId, // ✅ IMPORTANT (only current user)
    })
      .select("vehicle")
      .lean();

    // 🔥 STEP 4: CREATE SET OF VEHICLE IDS
    const myRunningVehicleIds = new Set(
      myRunningAttendance
        .map((item) => {
          if (!item.vehicle) return null;

          return typeof item.vehicle === "object"
            ? item.vehicle._id?.toString()
            : item.vehicle.toString();
        })
        .filter(Boolean)
    );

    // 🔥 STEP 5: REMOVE ONLY CURRENT USER RUNNING VEHICLES
    const availableVehicles = filtered.filter(
      (v) => !myRunningVehicleIds.has(v._id.toString())
    );

    if (!availableVehicles.length) {
      return res.status(404).json({
        success: false,
        message: "No vehicles available for check-in.",
      });
    }

    // 🔥 STEP 6: FORMAT RESPONSE
    const formatted = availableVehicles.map((v) => ({
      _id: v._id,
      name: v.asset?.masterItem?.description || "N/A",
      model: v.asset?.model || "",
      equipmentNo: v.asset?.equipmentNo || "",
      capacity: v.capacity,
      average: v.average,
      rentalStatus:
        v.vehicleType === "Rental" ? "Rented" : "Purchased",
      assignedStore: v.asset?.store?.name || "",
      assignedDrivers: v.operators || [],
    }));

    res.status(200).json({
      success: true,
      message: "Vehicles retrieved successfully.",
      results: formatted.length,
      data: formatted,
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});


exports.getVehicleByStatusAndRentalStatus = async (req, res, next) => {
  try {
    const { status, rentalStatus, includeDrivers } = req.body;

    let filter = {};

    if (status !== undefined && status !== "") {
      filter.isActive = status === true || status === "true";
    }

    if (rentalStatus && rentalStatus !== "") {
      filter.rentalStatus = rentalStatus;
    }

    // ✅ RAW vehicles (no populate)
    let vehicles = await Vehicle.find(filter)
      .setOptions({ skipPopulate: true })
      .lean();

    // ================= DRIVER =================
    if (includeDrivers === true || includeDrivers === "true") {

      const allDriverIds = vehicles.flatMap(v => v.assignedDrivers || []);

      const uniqueDriverIds = [
        ...new Set(
          allDriverIds
            .map(id => id?._id || id)
            .filter(id => mongoose.Types.ObjectId.isValid(id))
            .map(id => id.toString())
        )
      ].map(id => new mongoose.Types.ObjectId(id));

      const drivers = await User.find(
        { _id: { $in: uniqueDriverIds } },
        "name email store"
      ).lean();

      // 👉 Driver Store IDs
      const driverStoreIds = drivers
        .flatMap(d => d.store || [])
        .filter(Boolean);

      const uniqueDriverStoreIds = [
        ...new Set(
          driverStoreIds
            .map(id => id?._id || id)
            .filter(id => mongoose.Types.ObjectId.isValid(id))
            .map(id => id.toString())
        )
      ].map(id => new mongoose.Types.ObjectId(id));

      // 👉 Fetch Stores
      const driverStores = await Store.find(
        { _id: { $in: uniqueDriverStoreIds } },
        "name"
      ).lean();

      const driverStoreMap = {};
      driverStores.forEach(s => {
        driverStoreMap[s._id.toString()] = s;
      });

      // 👉 Driver Map
      const driverMap = {};
      drivers.forEach(d => {
        driverMap[d._id.toString()] = {
          ...d,
          storeDetails: (d.store || [])
            .map(id => {
              const validId = id?._id || id;
              return driverStoreMap[validId?.toString()];
            })
            .filter(Boolean)
        };
      });

      // 👉 Attach Drivers
      vehicles = vehicles.map(v => ({
        ...v,
        assignedDrivers: (v.assignedDrivers || [])
          .map(id => {
            const validId = id?._id || id;
            return driverMap[validId?.toString()];
          })
          .filter(Boolean)
      }));
    }

    // ================= VEHICLE STORE =================
    const storeIds = vehicles
      .map(v => v.assignedStore)
      .filter(Boolean);

    const uniqueStoreIds = [
      ...new Set(
        storeIds
          .map(id => id?._id || id)
          .filter(id => mongoose.Types.ObjectId.isValid(id))
          .map(id => id.toString())
      )
    ].map(id => new mongoose.Types.ObjectId(id));

    const stores = await Store.find(
      { _id: { $in: uniqueStoreIds } },
      "name location"
    ).lean();

    const storeMap = {};
    stores.forEach(s => {
      storeMap[s._id.toString()] = s;
    });

    // ================= CATEGORY =================
    const categoryIds = vehicles
      .map(v => v.category)
      .filter(Boolean);

    const uniqueCategoryIds = [
      ...new Set(
        categoryIds
          .map(id => id?._id || id)
          .filter(id => mongoose.Types.ObjectId.isValid(id))
          .map(id => id.toString())
      )
    ].map(id => new mongoose.Types.ObjectId(id));

    const categories = await Category.find(
      { _id: { $in: uniqueCategoryIds } },
      "name"
    ).lean();

    const categoryMap = {};
    categories.forEach(c => {
      categoryMap[c._id.toString()] = c;
    });

    // ================= FINAL =================
    vehicles = vehicles.map(v => {
      const storeId = v.assignedStore?._id || v.assignedStore;
      const categoryId = v.category?._id || v.category;

      return {
        ...v,
        assignedStore: storeId
          ? storeMap[storeId.toString()] || null
          : null,
        category: categoryId
          ? categoryMap[categoryId.toString()] || null
          : null
      };
    });

    res.status(200).json({
      status: "success",
      results: vehicles.length,
      data: vehicles
    });

  } catch (error) {
    next(error);
  }
};

exports.deleteVehicleById = factory.deleteOne(Vehicle);
