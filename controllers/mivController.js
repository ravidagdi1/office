const Request = require('../models/requestedModel');
const factory = require('./handlerFactory');
const catchAsync = require('../utils/catchAsync');
const AppError = require('../utils/appError');
const multer = require('multer');
const sharp = require('sharp');
const UsedItem = require('../models/usedItemModel');
const Miv = require('../models/MivFormModel');
const Mrv = require('../models/mrvFormModel');
const fs = require('fs');
const path = require('path');
const Item = require('../models/itemModel');
const Inventory = require('../models/inventoryModel');

const WaterDeatils=require('../models/waterDeatilsModel');
const mongoose=require('mongoose')


// Use memory storage (file will be stored in buffer, not disk)
const multerStorage = multer.memoryStorage();

// Filter to allow only image files
const multerFilter = (req, file, cb) => {
  if (file.mimetype.startsWith('image')) {
    cb(null, true);
  } else {
    cb(new AppError('Not an image! Please upload only images.', 400), false);
  }
};

// Initialize multer upload
const upload = multer({
  storage: multerStorage,
  fileFilter: multerFilter
});

// Middleware to handle single file upload (key: 'image')
exports.uploadProductPhoto = upload.single('image');

// Middleware to resize and save image using sharp
exports.resizeProductPhoto = catchAsync(async (req, res, next) => {
  if (!req.file) return next(); // Skip if no file uploaded

  const filename = `miv-${Date.now()}.jpeg`;
  const outputPath = path.join(__dirname, '../public/img/miv', filename);

  // Resize and convert to jpeg
  await sharp(req.file.buffer)
    .resize({ width: 800 })
    .toFormat('jpeg')
    .jpeg({ quality: 70, mozjpeg: true, progressive: true })
    .toFile(outputPath);

  // Save filename for later processing
  req.body.fileName = filename;

  next();
});



exports.createMiv = catchAsync(async (req, res, next) => {

    req.body.user = req.user._id;
    req.body.image = req.body.fileName
    console.log(req.body)
    const doc = await Miv.create(req.body);
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
exports.getAllMiv = catchAsync(async (req,res,next)=>{
  
  const user = req.user;
  console.log("user ",req.query.query)
  console.log("user 2",user)
  let filter = {};

  if(user.role == 'superAdmin' || user.role == 'admin' ){
    filter = {store:req.query.query ,status:req.query.status}
  }else{
    filter = {store:req.query.query ,status:"open"}
  }
  console.log(filter)
  const doc = await Miv.find(filter)

  res.status(201).json({
    status: 'success',
    data: {
      data: doc
    }
  });
})


// Controller: Get all MIVs by store and status
exports.getAllMivByStoreAndStatus = catchAsync(async (req, res, next) => {
  const { store, status } = req.query;

  if (!store || !status) {
    return res.status(400).json({
      status: 'fail',
      message: 'Store and status are required',
    });
  }

  const filter = {
    store,
    status,
  };

 const doc = await Miv.find(filter).sort({ createdAt: -1 });


  res.status(200).json({
    status: 'success',
    results: doc.length,
    data: {
      data: doc,
    },
  });
});

// exports.submitMiv = catchAsync(async (req,res,next)=>{
//   console.log(req.body.mivId)
//   const User  = req.user;
//   const reqId = req.body.mivId;
//   const items = req.body.items;

//   const request = await Miv.findById(reqId)
//   if(!request.status == 'open'){
//       return next(new AppError('This Requisition is alrady submited !'))
//   }
//   console.log(request)
//   request.status = 'submit' 
//   request.save();

//   for (const item of items) {
//     const inventory = await Inventory.findById(item.inventory);
//     console.log(item)
//     if(item.status){
//       return next(new AppError('This route is not for Status Change !'))
//     }
//     if(item.usedQty  > inventory.currentStock){
//       console.log("check1")
//       return next(new AppError('Qty Used should be less then currentStock'))
//     }

//     item.user = req.user._id;
//     item.miv = reqId
//     item.status = 'pending'
//     item.store = inventory.store._id
//     item.usedQty = item.usedQty
//      await UsedItem.create(item);
//   }

//   // Send success response
//   res.status(200).json({
//     status: 'success',
//     message: 'Miv and Used item have been updated successfully.',
//   });

// })


exports.submitMiv = catchAsync(async (req, res, next) => {
  console.log(req.body.mivId);
  const user = req.user;
  const reqId = req.body.mivId;
  const items = req.body.items;

  // 1️⃣ Check if the MIV request exists and has 'open' status
  const request = await Miv.findById(reqId);
  if (!request) {
    return next(new AppError('MIV request not found.', 404));
  }

  if (request.status !== 'open') {
    return next(new AppError('This MIV is already submitted!', 400));
  }

  // Update MIV status to 'submit'
  request.status = 'submit';
  await request.save();

  // 2️⃣ Loop through each item in the MIV request
  for (const item of items) {
    // ✅ Check if the item already exists in the MIV
    const existingItem = await UsedItem.findOne({
      miv: reqId,
      inventory: item.inventory,
    });

    if (existingItem) {
      console.log(`Item already exists for mivId: ${reqId}, inventory: ${item.inventory}`);
      continue; // Skip creating a duplicate item
    }

    // 3️⃣ Check if the inventory exists
    const inventory = await Inventory.findById(item.inventory);
    if (!inventory) {
      return next(new AppError(`Inventory item with ID ${item.inventory} not found.`, 404));
    }

    // 4️⃣ Check if the used quantity exceeds the current stock
    if (item.usedQty > inventory.currentStock) {
      return next(new AppError('Used quantity should be less than current stock.', 400));
    }

    // 5️⃣ Prevent status changes via this route
    if (item.status) {
      return next(new AppError('This route is not for status change!', 400));
    }

    // 6️⃣ Create a new used item
    const newItem = {
      user: user._id,
      miv: reqId,
      inventory: item.inventory,
      store: inventory.store._id,
      status: 'pending',
      usedQty: item.usedQty,
    };

    await UsedItem.create(newItem);
  }

  // 7️⃣ Send success response
  res.status(200).json({
    status: 'success',
    message: 'MIV and used items have been updated successfully.',
  });
});



exports.newsubmitMiv = catchAsync(async (req, res, next) => {
  const user = req.user;
  const { items, store, remark } = req.body;

  if (!store || !items || !Array.isArray(items) || items.length === 0) {
    return next(new AppError("Store and at least one item are required.", 400));
  }

  // 🚫 Prevent duplicate items inside request
  const inventoryIds = items.map(it => String(it.inventory));
  const uniqueIds = new Set(inventoryIds);
  if (uniqueIds.size !== inventoryIds.length) {
    return next(new AppError("Duplicate items detected in request.", 400));
  }

  const session = await Miv.startSession();
  session.startTransaction();
  try {
    // 1️⃣ Generate unique mivNo
    const lastMiv = await Miv.findOne().sort({ mivNo: -1 }).session(session);
    const newMivNo = lastMiv ? lastMiv.mivNo + 1 : 10001;

    // 2️⃣ Create new MIV doc once
    const [mivDoc] = await Miv.create(
      [
        {
          mivNo: newMivNo,
          store,
          user: user._id,
          status: "submit", // directly submit
          remark: remark || "",
        },
      ],
      { session }
    );

    // 3️⃣ Validate and create UsedItems
    for (const item of items) {
      const inventory = await Inventory.findById(item.inventory).session(session);
      if (!inventory) {
        throw new AppError(`Inventory item ${item.inventory} not found.`, 404);
      }

      if (item.usedQty > inventory.currentStock) {
        throw new AppError(
          `Used quantity exceeds current stock for item ${item.inventory}.`,
          400
        );
      }

      if (item.status) {
        throw new AppError("Status change not allowed via this route.", 400);
      }

      await UsedItem.create(
        [
          {
            user: user._id,
            miv: mivDoc._id,
            inventory: item.inventory,
            store: inventory.store._id,
            status: "pending",
            usedQty: item.usedQty,
            remark: item.remark || "",
          },
        ],
        { session }
      );
    }

    await session.commitTransaction();
    session.endSession();

    // ✅ Success
    res.status(200).json({
      status: "success",
      message: `MIV #${mivDoc.mivNo} created and submitted successfully.`,
      mivId: mivDoc._id,
    });
  } catch (err) {
    await session.abortTransaction();
    session.endSession();
    return next(err);
  }
});



exports.submitWaterMiv = catchAsync(async (req, res, next) => {
  const user = req.user;
  const {
    mivId: reqId,
    mrvId,
    items,
    supplierName,
    invoiceNo,
    vehicleNo,
    inTime,
    outTime,
  } = req.body;

  // 1️⃣ Validate MIV
  const request = await Miv.findById(reqId);
  if (!request) return next(new AppError('MIV request not found.', 404));
  if (request.status !== 'open')
    return next(new AppError('This MIV is already submitted!', 400));

  // 2️⃣ Validate MRV
  const mrvRequest = await Mrv.findById(mrvId);
  if (!mrvRequest) return next(new AppError('MRV request not found.', 404));
  if (mrvRequest.status !== 'close')
    return next(new AppError('This MRV is not closed!', 400));

  // 3️⃣ Process each item
  for (const item of items) {
    const inventoryId = new mongoose.Types.ObjectId(item.inventory);
    const mrvObjectId = new mongoose.Types.ObjectId(mrvId);

    // 🔁 Check for existing UsedItem
    const existingItem = await UsedItem.findOne({
      miv: reqId,
      inventory: inventoryId,
    });

    if (existingItem) {
      console.log(`Item already exists for mivId: ${reqId}, inventory: ${item.inventory}`);
      continue; // skip duplicates
    }

    // 📦 Check inventory
    const inventory = await Inventory.findById(inventoryId);
    if (!inventory) {
      return next(new AppError(`Inventory item with ID ${item.inventory} not found.`, 404));
    }

    // 📉 Stock check
    if (item.usedQty > inventory.currentStock) {
      return next(new AppError('Used quantity should be less than current stock.', 400));
    }

    // 🚫 Disallow status override
    if (item.status) {
      return next(new AppError('This route is not for status change!', 400));
    }

    // ✅ Create UsedItem
    await UsedItem.create({
      user: user._id,
      miv: reqId,
      inventory: inventoryId,
      store: inventory.store._id,
      status: 'pending',
      usedQty: item.usedQty,
    });

    // ✅ Create WaterDetail
    await WaterDeatils.create({
      date: new Date(),
      gateEntryNo: `GATE-${Date.now()}`,
      inTime,
      outTime,
      supplierName,
      invoiceOrChallanNo: invoiceNo,
      vehicleNo,
      mrv: mrvObjectId,
      miv: reqId,
      description: item.description || '',
      uom: item.unit,
      qty: item.usedQty,
    });

    // ✅ Update waterConsumedStatus in Item table
    const updateResult = await Item.updateOne(
      { mrv: mrvObjectId, inventory: inventoryId },
      { $set: { waterConsumedStatus: 'consumed' } }
    );

    console.log('Item update result:', updateResult);
  }

  // 4️⃣ Now safely update MIV status to 'submit' after all item processing is done
  request.status = 'submit';
  await request.save();

  // 5️⃣ Respond success
  res.status(200).json({
    status: 'success',
    message: 'MIV, Used Items, and Water details have been submitted successfully.',
  });
});



exports.getSingleMiv = factory.getAll(Miv);

exports.updateUsedItem = catchAsync(async(req,res,next)=>{
  console.log(req.body)
  let body = {}
   if(req.user.role !== 'admin'){
      body = req.body
   }else{
    return next(new AppError('U are not authorize !', 404));
   }

   console.log("b9d",body)
   const doc = await Request.findByIdAndUpdate(req.params.id, body, { new: true, runValidators: true });

   console.log("res",doc)
   res.status(201).json({
    status: 'success',
    data: {
      data: doc
    }
  });

});
exports.deleteMiv = factory.deleteOne(Request);
