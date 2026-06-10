const MasterList = require('../models/masterListModel');
const Request = require('../models/requestedModel');
const factory = require('./handlerFactory');
const catchAsync = require('../utils/catchAsync');
const User = require('../models/userModel');
const Inventory = require('../models/inventoryModel');
const AppError = require('../utils/appError');
const multer = require('multer');
const sharp = require('sharp');
const Item = require('../models/itemModel');
const fs = require('fs');
const Mrv = require('../models/mrvFormModel');
const path = require('path');
const mongoose = require("mongoose");




// ✅ Use memory storage so original image isn't saved to disk
const multerStorage = multer.memoryStorage();

// ✅ Filter to allow only image uploads
const multerFilter = (req, file, cb) => {
  if (file.mimetype.startsWith('image')) {
    cb(null, true);
  } else {
    cb(new AppError('Not an image! Please upload only images.', 400), false);
  }
};

// ✅ Multer instance with memory storage and filter
const upload = multer({
  storage: multerStorage,
  fileFilter: multerFilter
});

// ✅ Middleware to handle single file upload named 'image'
exports.uploadProductPhoto = upload.single('image');

// ✅ Resize & save image to public/img/requisitionform
exports.resizeProductPhoto = catchAsync(async (req, res, next) => {
  if (!req.file) return next(); // No file uploaded

  const filename = `product-${Date.now()}.jpeg`; // Same as existing filename logic
  const outputPath = path.join(__dirname, '../public/img/requisitionform', filename);

  // ✅ Resize and compress using sharp before saving
  await sharp(req.file.buffer)
    .resize({ width: 800 }) // Resize to 800px wide
    .toFormat('jpeg')
    .jpeg({ quality: 70, mozjpeg: true, progressive: true })
    .toFile(outputPath); // Save to disk

  req.body.fileName = filename; // Pass filename to next middleware/controller
  next();
});




exports.createRequest = catchAsync(async (req, res, next) => {

  const inventory = await Inventory.findById(req.body.inventory);
  console.log("inventory", inventory)
  if (req.body.status) {
    return next(new AppError('This route is not for Status Change !'))
  }
  req.body.user = req.user._id;
  req.body.image = req.body.fileName
  console.log(req.body)

  const doc = await Request.create(req.body);
  if (!doc) {
    console.log('log')
    return next(new AppError('No document found with that ID', 404));
  }
  res.status(201).json({
    status: 'success',
    data: {
      data: doc
    }
  });
});
exports.getAllRequest = catchAsync(async (req, res, next) => {

  const user = req.user;
  console.log("user ", req.query.query)
  console.log("user", req.query.status)
  console.log("user 2", user)
  let filter = {};


  if (req.query.status === "undefined") {
    filter = { store: req.query.query, status: "open" }
  } else {
    filter = { store: req.query.query, status: req.query.status }
  }

  const doc = await Request.find(filter)

  res.status(201).json({
    status: 'success',
    data: {
      data: doc
    }
  });
})

exports.getAllStatusRequest = catchAsync(async (req, res, next) => {
  const { query: store, status } = req.query;

  let statuses = [];
  if (status) {
    try {
      // Parse JSON string into an array
      statuses = JSON.parse(status);
    } catch (error) {
      return res.status(400).json({
        status: 'error',
        message: 'Invalid status format. Please send a valid JSON array.',
      });
    }
  }

  const filter = {
    store,
    ...(statuses.length > 0 && { status: { $in: statuses } }),
  };

  const doc = await Request.find(filter).sort({ createdAt: -1 });


  res.status(200).json({
    status: 'success',
    data: {
      data: doc,
    },
  });
});




exports.submitRequist = catchAsync(async (req, res, next) => {
  console.log(req.body.requisitionId)
  const User = req.user;
  const reqId = req.body.requisitionId;
  const items = req.body.items;

  if (items.length === 0) {
    return next(new AppError('Please select Item First !'))
  }
  // await Request.findByIdAndUpdate(reqId,{status:'submit'})
  const request = await Request.findById(reqId)
  if (!request.status == 'open') {
    return next(new AppError('This Requisition is alrady submited !'))
  }
  console.log(request)
  request.status = 'submit'
  request.save();



  for (const item of items) {
    const existingItem = await Item.findOne({
      requisitionNo: reqId,
      inventory: item.inventory,
      store: item.store,
    });

    // Check if the item already exists
    if (existingItem) {
      console.log(`Item already exists for requisitionNo: ${reqId}, inventory: ${item.inventory}`);
      continue; // Skip creating a duplicate item
    }

    const inventory = await Inventory.findById(item.inventory);
    if (!inventory) {
      return next(new AppError('Inventory item not found.'));
    }

    if (item.qtyRequired > inventory.qtyAuth - inventory.currentStock) {
      console.log("check1");
      return next(new AppError('Qty required should be less than AuthQty.'));
    }

    // Create the new item
    item.user = req.user._id;
    item.requisitionNo = reqId;
    item.status = 'pending';
    item.store = inventory.store._id;

    await Item.create(item);
  }


  // Send success response
  res.status(200).json({
    status: 'success',
    message: 'Requisition and items have been updated successfully.',
  });

})

//new submitrequest

exports.newSubmitRequist = catchAsync(async (req, res, next) => {
  const user = req.user;
  const items = req.body.items;
  const storeId = req.body.store;

  if (!storeId) {
    return next(new AppError("Store is required!", 400));
  }

  if (!items || items.length === 0) {
    return next(new AppError("Please select Item First!", 400));
  }

  // =====================================
  // ✅ VALIDATE ALL ITEM REMARKS
  // =====================================
  for (let i = 0; i < items.length; i++) {
    if (!items[i].storeRemark || !items[i].storeRemark.trim()) {
      return next(
        new AppError(
          `Remark is required for Item ${i + 1}`,
          400
        )
      );
    }
  }

  // =====================================
  // AUTO GENERATE REQUISITION NUMBER
  // =====================================
  const lastRequest = await Request.findOne().sort({
    requisitionNo: -1
  });

  const newRequisitionNo = lastRequest
    ? lastRequest.requisitionNo + 1
    : 10001;

  // =====================================
  // CREATE REQUISITION
  // =====================================
  const newRequest = await Request.create({
    requisitionNo: newRequisitionNo,
    user: user._id,
    image: "",
    store: storeId,
    status: "submit"
  });

  const reqId = newRequest._id;

  // =====================================
  // CREATE ITEMS
  // =====================================
  for (const item of items) {
    const existingItem = await Item.findOne({
      requisitionNo: reqId,
      inventory: item.inventory,
      store: item.store
    });

    if (existingItem) {
      console.log(
        `Item already exists for requisitionNo: ${reqId}, inventory: ${item.inventory}`
      );
      continue;
    }

    const inventory = await Inventory.findById(
      item.inventory
    );

    if (!inventory) {
      return next(
        new AppError("Inventory item not found.")
      );
    }

    if (
      Number(item.qtyRequired) >
      Number(inventory.qtyAuth) -
        Number(inventory.currentStock)
    ) {
      return next(
        new AppError(
          "Qty required should be less than AuthQty."
        )
      );
    }

    item.user = user._id;
    item.requisitionNo = reqId;
    item.status = "pending";
    item.store = inventory.store._id;

    // ✅ SAVE STORE REMARK
    item.storeRemark = item.storeRemark?.trim();

    await Item.create(item);
  }

  // =====================================
  // RESPONSE
  // =====================================
  res.status(200).json({
    status: "success",
    message:
      "New requisition and items created successfully.",
    data: {
      requisitionId: reqId,
      requisitionNo: newRequisitionNo
    }
  });
});

//new requestion creation by superAdmin directly

exports.newSubmitRequistBySuperAdmin = catchAsync(
  async (req, res, next) => {
    const user = req.user;
    const items = req.body.items;
    const storeId = req.body.store;

    // =====================================
    // ✅ ONLY SUPER ADMIN ALLOWED
    // =====================================
    if (user.role !== "superAdmin") {
      return next(
        new AppError(
          "You are not authorized for this action",
          403
        )
      );
    }

    // =====================================
    // VALIDATION
    // =====================================
    if (!storeId) {
      return next(
        new AppError("Store is required!", 400)
      );
    }

    if (!items || items.length === 0) {
      return next(
        new AppError(
          "Please select Item First!",
          400
        )
      );
    }

    // =====================================
    // VALIDATE REMARKS
    // =====================================
    for (let i = 0; i < items.length; i++) {
      if (
        !items[i].storeRemark ||
        !items[i].storeRemark.trim()
      ) {
        return next(
          new AppError(
            `Remark is required for Item ${i + 1}`,
            400
          )
        );
      }
    }

    // =====================================
    // AUTO GENERATE REQUISITION NUMBER
    // USING skipPopulate
    // =====================================
    const lastRequest =
      await Request.findOne()
        .sort({ requisitionNo: -1 })
        .setOptions({ skipPopulate: true });

    const newRequisitionNo = lastRequest
      ? lastRequest.requisitionNo + 1
      : 10001;

    // =====================================
    // CREATE REQUEST
    // =====================================
    const newRequest = await Request.create({
      requisitionNo: newRequisitionNo,
      user: user._id,
      image: "",
      store: storeId,
      status: "pendingWithBoss",
      revisionType: "priority",
      //sentBySuperAdmin: user._id,
      //sentBySuperAdminAt: new Date()
    });

    const reqId = newRequest._id;

    // =====================================
    // CREATE ITEMS
    // =====================================
    for (const item of items) {
      const existingItem =
        await Item.findOne({
          requisitionNo: reqId,
          inventory: item.inventory,
          store: item.store
        }).setOptions({
          skipPopulate: true
        });

      // =====================================
      // DUPLICATE ITEM SKIP
      // =====================================
      if (existingItem) {
        console.log(
          `Duplicate skipped: ${item.inventory}`
        );
        continue;
      }

      const inventory =
        await Inventory.findById(
          item.inventory
        ).setOptions({
          skipPopulate: true
        });

      if (!inventory) {
        return next(
          new AppError(
            "Inventory item not found.",
            400
          )
        );
      }

      if (
        Number(item.qtyRequired) >
        Number(inventory.qtyAuth) -
          Number(inventory.currentStock)
      ) {
        return next(
          new AppError(
            "Qty required should be less than AuthQty."
          )
        );
      }

      await Item.create({
        inventory: item.inventory,
        requisitionNo: reqId,
        user: user._id,
        store: inventory.store,
        qtyRequired: item.qtyRequired,
        approveQty: item.qtyRequired,
        storeRemark:
          item.storeRemark?.trim(),
        status:
          "approvedBySuperAdmin",
        poStatus:
          "waitingForBoss",
        approvedBySuperAdmin:
          user._id,
        superAdminApprovedAt:
          new Date()
      });
    }

    // =====================================
    // RESPONSE
    // =====================================
    res.status(200).json({
      status: "success",
      message: `Priority requisition ${newRequisitionNo} created successfully.`,
      requisitionNo:
        newRequisitionNo,
      data: {
        requisitionId: reqId,
        requisitionNo:
          newRequisitionNo
      }
    });
  }
);


//dashboard request pendind data


{ /* exports.getAllRequestDashboradData = catchAsync(async (req, res, next) => {
  const user = req.user;

  let filter = {};

  if (['superAdmin', 'director'].includes(user.role)) {
    filter = {
      status: { $in: ['submit', 'adminSubmit', 'pendingWithBoss'] }
    };
  } else {
    return next(new AppError('You are not authorized!', 403));
  }

  // ================= DATA =================
  const totalSubmitted = await Request.countDocuments(filter);

  const requestData = await Request.find(filter)
    .sort({ createdAt: -1 });

  // ================= ADD ITEMS + COUNT =================
  const requestWithItems = await Promise.all(
    requestData.map(async (reqItem) => {

      const items = await Item.find({ requisitionNo: reqItem._id })
        .select('inventory qtyRequired approveQty status adminRemark')
        .populate({
          path: 'inventory',
          select: 'qtyAuth currentStock',
          populate: {
            path: 'masterItem',
            select: 'partNo description unit'
          }
        });

      return {
        ...reqItem._doc,
        itemCount: items.length,
        items: items.map(item => ({
          _id: item._id,
          partNo: item?.inventory?.masterItem?.partNo || '-',
          description: item?.inventory?.masterItem?.description || '-',
          unit: item?.inventory?.masterItem?.unit?.name || '-',
          authQty: item?.inventory?.qtyAuth || 0,
          requiredQty: item?.qtyRequired || 0,
          approvedQty: item?.approveQty || 0,
          currentStock: item?.inventory?.currentStock || 0,
          status: item?.status || '-',
          adminRemark: item?.adminRemark || ''
        }))
      };
    })
  );

  // ================= RESPONSE =================
  res.status(200).json({
    status: 'success',
    results: requestWithItems.length,
    data: {
      totalSubmitted,
      requestData: requestWithItems
    }
  });
});

*/}


exports.getAllRequestDashboradData = catchAsync(
  async (req, res, next) => {
    const user = req.user;

    // ===================================
    // BASE FILTER
    // ===================================
    let filter = {
      status: {
        $in: [
          "submit",
          "adminSubmit",
          "pendingWithBoss",
           
        ]
      }
    };

    // ===================================
    // FULL ACCESS ROLES
    // SAME AS SUPERADMIN
    // ===================================
    const fullAccessRoles = [
      "superAdmin",
      "director",
      "pomaker",
      "pochecker",
      "accounts",
      "billing" // ✅ ADD THIS
    ];

    // ===================================
    // ROLE BASED LOGIC
    // ===================================

    // ADMIN / STOREKEEPER
    if (
      ["admin", "storeKeeper"].includes(
        user.role
      )
    ) {
      if (
        !user.store ||
        !Array.isArray(user.store) ||
        user.store.length === 0
      ) {
        return next(
          new AppError(
            "No store assigned to this user",
            400
          )
        );
      }

      const storeIds =
        user.store.map(
          (s) => s._id
        );

      filter.store = {
        $in: storeIds
      };
    }

    // SUPERADMIN / DIRECTOR /
    // POMAKER / POCHECKER
    else if (
      fullAccessRoles.includes(
        user.role
      )
    ) {
      // full access
    }

    // BLOCK OTHER ROLES
    else {
      return next(
        new AppError(
          "You are not authorized!",
          403
        )
      );
    }

    // ===================================
    // FETCH REQUESTS
    // ===================================
    const [
      totalSubmitted,
      requestData
    ] = await Promise.all([
      Request.countDocuments(
        filter
      ).setOptions({
        skipPopulate: true
      }),

      Request.find(
        filter,
        null,
        {
          skipPopulate: true
        }
      )
        .populate("store")
        .populate("user")
        .populate(
          "returnedByDirector",
          "name email role"
        )
        .populate(
          "sentBySuperAdmin",
          "name email role"
        )
        .sort({
          createdAt: -1
        })
        .lean()
    ]);

    // ===================================
    // REQUEST IDS
    // ===================================
    const requestIds =
      requestData.map((r) =>
        r._id.toString()
      );

    // ===================================
    // FETCH ITEMS
    // ===================================
    const allItems =
      await Item.find({
        requisitionNo: {
          $in: requestIds
        },

        status: {
          $nin: [
            "rejected",
            "autoclosed",
            "forceclosed"
          ]
        }
      })
        .select(
          "inventory requisitionNo qtyRequired approveQty status adminRemark storeRemark remark"
        )
        .populate({
          path: "inventory",
          select:
            "qtyAuth currentStock",
          populate: {
            path: "masterItem",
            select:
              "partNo description unit"
          }
        })
        .lean();

    // ===================================
    // GROUP ITEMS
    // ===================================
    const itemMap = {};

    allItems.forEach(
      (item) => {
        const key =
          item.requisitionNo
            ?._id
            ? item.requisitionNo._id.toString()
            : item.requisitionNo?.toString();

        if (!itemMap[key]) {
          itemMap[key] = [];
        }

        itemMap[key].push(item);
      }
    );

    // ===================================
    // FINAL DATA
    // ===================================
    const requestWithItems =
      requestData.map(
        (reqItem) => {
          const items =
            itemMap[
              reqItem._id.toString()
            ] || [];

          return {
            ...reqItem,
            itemCount:
              items.length,

            items: items.map(
              (item) => ({
                _id: item._id,

                partNo:
                  item?.inventory
                    ?.masterItem
                    ?.partNo ||
                  "-",

                description:
                  item?.inventory
                    ?.masterItem
                    ?.description ||
                  "-",

                unit:
                  item?.inventory
                    ?.masterItem
                    ?.unit?.name ||
                  "-",

                authQty:
                  item?.inventory
                    ?.qtyAuth || 0,

                requiredQty:
                  item?.qtyRequired ||
                  0,

                approvedQty:
                  item?.approveQty ||
                  0,

                currentStock:
                  item?.inventory
                    ?.currentStock ||
                  0,

                status:
                  item?.status ||
                  "-",

                adminRemark:
                  item?.adminRemark ||
                  "",

                storeRemark:
                  item?.storeRemark ||
                  "",

                remark:
                  item?.remark ||
                  ""
              })
            )
          };
        }
      );

    // ===================================
    // RESPONSE
    // ===================================
    res.status(200).json({
      status: "success",
      results:
        requestWithItems.length,

      data: {
        totalSubmitted,
        requestData:
          requestWithItems
      }
    });
  }
);

//return requestion by the director and reverse too

exports.returnToAdminByDirector = catchAsync(async (req, res, next) => {

  const user = req.user;
  const { requisitionId, remark } = req.body;

  // =====================================
  // ✅ VALIDATION
  // =====================================
  if (!requisitionId) {
    return next(new AppError('Requisition ID is required', 400));
  }

  if (!remark) {
    return next(new AppError('Remark is required', 400));
  }

  // =====================================
  // 1️⃣ FIND REQUEST
  // =====================================
  const request = await Request.findById(requisitionId);

  if (!request) {
    return next(new AppError('Request not found', 404));
  }

  // =====================================
  // 2️⃣ ROLE BASED LOGIC 🔥
  // =====================================

  // ✅ DIRECTOR → RETURN TO ADMIN
  if (user.role === 'director') {

    request.status = 'adminSubmit';

    request.directorRemark = remark;
    request.returnedByDirector = user._id;
    request.returnedByDirectorAt = new Date();

    request.revisionType = 'revised';
  }

  // ✅ SUPERADMIN → SEND TO BOSS
  else if (user.role === 'superAdmin') {

    request.status = 'pendingWithBoss';

    request.superAdminRemark = remark;
    request.sentBySuperAdmin = user._id;
    request.sentBySuperAdminAt = new Date();

    request.revisionType = 'revised';
  }

  // ❌ BLOCK OTHER ROLES
  else {
    return next(new AppError('Not authorized for this action', 403));
  }

  // =====================================
  // 3️⃣ SAVE
  // =====================================
  await request.save();

  // =====================================
  // ✅ RESPONSE
  // =====================================
  res.status(200).json({
    status: 'success',
    message:
      user.role === 'director'
        ? 'Returned to Admin successfully'
        : 'Sent to Boss successfully',
    data: {
      request
    }
  });

});

// extract the store from request table on the baisis of the 3 status

exports.getStoresFromRequests = catchAsync(async (req, res, next) => {
  const user = req.user;

  // ===================================
  // ✅ ROLE CHECK
  // ===================================
  if (!['superAdmin', 'director'].includes(user.role)) {
    return next(new AppError('You are not authorized!', 403));
  }

  // ===================================
  // ✅ FILTER
  // ===================================
  const filter = {
    status: { $in: ['adminSubmit', 'pendingWithBoss'] }
  };

  // ===================================
  // ✅ AGGREGATION
  // ===================================
  const stores = await Request.aggregate([
    { $match: filter },

    // ✅ GROUP BY store + status + revisionType (SAFE)
    {
      $group: {
        _id: {
          store: "$store",
          status: "$status",
          revisionType: {
            $ifNull: ["$revisionType", "unknown"] // ✅ FIXED
          }
        }
      }
    },

    // ===================================
    // 👉 JOIN STORE DETAILS
    // ===================================
    {
      $lookup: {
        from: "stores", // ⚠️ confirm collection name
        localField: "_id.store",
        foreignField: "_id",
        as: "storeDetails"
      }
    },

    {
      $unwind: {
        path: "$storeDetails",
        preserveNullAndEmptyArrays: true
      }
    },

    // ===================================
    // 👉 FINAL FORMAT
    // ===================================
    {
      $project: {
        _id: 0,
        storeId: "$_id.store",
        storeName: "$storeDetails.name",
        status: "$_id.status",
        revisionType: "$_id.revisionType"
      }
    }
  ]);

  // ===================================
  // ✅ RESPONSE
  // ===================================
  res.status(200).json({
    status: 'success',
    results: stores.length,
    data: {
      stores
    }
  });
});


exports.submitRequistForDesile = catchAsync(async (req, res, next) => {

  const User = req.user;
  const items = req.body.items;


  for (const item of items) {
    const inventory = await Inventory.findById(item.inventory);
    console.log(item)
    if (item.status) {
      return next(new AppError('This route is not for Status Change !'))
    }
    if (item.qtyRequired > inventory.qtyAuth - inventory.currentStock) {
      console.log("check1")
      return next(new AppError('Qty required should be less then AuthQty'))
    }

    const request = await Request.create({
      requisitionNo: Date.now(),
      store: inventory.store._id, // Assuming all items belong to the same store
      user: req.user._id,
      status: 'adminSubmit',
    })

    const mrv = await Mrv.create({
      mrvNo: request.requisitionNo,
      store: inventory.store._id,
      user: req.user._id,
      status: "submit"
    })

    item.user = req.user._id;
    item.mrv = mrv._id;
    item.approveQty = item.qtyRequired;
    item.requisitionNo = request._id;
    item.status = 'approved';
    item.store = inventory.store._id;
    await Item.create(item);
  }

  // Send success response
  res.status(200).json({
    status: 'success',
    message: 'Requisition and items have been updated successfully.',
  });

})


exports.getInventoryItem = factory.getAll(Request);

exports.updateRequestItem = catchAsync(async (req, res, next) => {
  console.log(req.body)
  let body = {}
  if (req.user.role !== 'admin') {
    body = req.body
  } else {
    body.status = 'submit'
  }

  console.log("b9d", body)
  const doc = await Request.findByIdAndUpdate(req.params.id, body, { new: true, runValidators: true });

  console.log("res", doc)
  res.status(201).json({
    status: 'success',
    data: {
      data: doc
    }
  });

});
exports.deleteInventroyItem = factory.deleteOne(Request);


exports.getRequests = async (req, res) => {
  try {
    const { store, dateFrom, dateTo, status } = req.query;

    // Build the query object
    const query = {
      active: true, // Assuming you want only active requests
    };

    // Add store to the query if provided
    if (store) {
      query.store = store;
    }

    // Add status to the query if provided
    if (status) {
      query.status = status;
    }

    // Add date range to the query if both dates are provided
    if (dateFrom && dateTo) {
      query.createdAt = {
        $gte: new Date(dateFrom), // Start date
        $lte: new Date(dateTo),   // End date
      };
    }

    // Fetch the requests based on the constructed query
    const requests = await Request.find(query);

    // Check if requests were found
    if (requests.length === 0) {
      return res.status(404).json({
        status: 'fail',
        message: 'No requests found for the given criteria.',
      });
    }

    // Return the found requests
    res.status(200).json({
      status: 'success',
      results: requests.length,
      data: {
        requests,
      },
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      status: 'error',
      message: 'An error occurred while fetching requests.',
    });
  }
};

//waterRequestion detail




