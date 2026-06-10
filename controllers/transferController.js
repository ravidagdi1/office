
const Transfer = require('../models/transferModel');
const factory = require('./handlerFactory');
const catchAsync = require('../utils/catchAsync');
const User = require('../models/userModel');
const Inventory = require('../models/inventoryModel');
const Asset=require('../models/assetModel')
const AppError = require('../utils/appError');
const multer = require('multer');
const sharp = require('sharp');
const Item = require('../models/itemModel');
const fs = require('fs');
const TransferItem = require('../models/transferItemModel');
const path = require('path');
const mongoose = require("mongoose");


// ✅ 1. Use memory storage (no file written before resize)
const multerStorage = multer.memoryStorage();

// ✅ 2. Allow only image files
const multerFilter = (req, file, cb) => {
  if (file.mimetype.startsWith('image')) {
    cb(null, true);
  } else {
    cb(new AppError('Not an image! Please upload only images.', 400), false);
  }
};

// ✅ 3. Setup multer
const upload = multer({
  storage: multerStorage,
  fileFilter: multerFilter
});

// ✅ 4. Middleware to upload single image (field name: 'image')
exports.uploadProductPhoto = upload.single('image');

// ✅ 5. Resize + Save image to `transferForm` directory
exports.resizeProductPhoto = catchAsync(async (req, res, next) => {
  if (!req.file) return next(); // No file uploaded

  const filename = `product-${Date.now()}.jpeg`;
  const outputDir = path.join(__dirname, '../public/img/transferForm');
  const outputPath = path.join(outputDir, filename);

  // Ensure directory exists (optional safety)
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  // ✅ Resize & save the image
  await sharp(req.file.buffer)
    .resize({ width: 800 }) // Resize to 800px width
    .toFormat('jpeg')
    .jpeg({ quality: 70, mozjpeg: true, progressive: true }) // Match quality from existing code
    .toFile(outputPath);

  // ✅ Store filename in request body for controller usage
  req.body.fileName = filename;

  next(); // Move to next middleware/controller
});



exports.createRequest = catchAsync(async (req, res, next) => {
    
    // const inventory = await Inventory.findById(req.body.inventory);
    // console.log("inventory",inventory)
    if(req.body.status){
      return next(new AppError('This route is not for Status Change !'))
    }
    req.body.user = req.user._id;
    req.body.image = req.body.fileName
    console.log(req.body)

    const doc = await Transfer.create(req.body);
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
exports.getAllRequest = catchAsync(async (req,res,next)=>{
  
  const user = req.user;
  console.log("user ",user)
  
  let filter = {};

 
    filter = {storeFrom:req.query.query ,status:req.query.status}
  

  console.log("user 2",filter)

  const doc = await Transfer.find(filter)
  
  console.log(doc)
  res.status(201).json({
    status: 'success',
    data: {
      data: doc
    }
  });
})




// exports.submitRequist = catchAsync(async (req,res,next)=>{
//   console.log(req.body.transferId)
//   const User  = req.user;
//   const reqId = req.body.transferId;
//   const items = req.body.items;

//   const transfer = await Transfer.findById(reqId)
//   if(!transfer.status == 'open'){
//       return next(new AppError('This Transfer is alrady submited !'))
//   }
  
//   transfer.status = 'submit' 
//   transfer.save();

//   for (const item of items) {
//     const inventory = await Inventory.findById(item.inventory);
//     console.log(item)
//     if(item.status){
//       return next(new AppError('This route is not for Status Change !'))
//     }
//     if(item.transferQty  > inventory.currentStock){
//       console.log("check1")
//       return next(new AppError('Qty Transfer should be less then currentStock'))
//     }

//      console.log(transfer)

//     item.user = req.user._id;
//     item.transfer = req.body.transferId
//     item.inventory = item.inventory
//     item.to = transfer.storeTo._id
//     item.from = transfer.storeFrom._id
//     item.status = 'pending'
//     item.transferDate = new Date()
//     item.transferQty = item.transferQty

//     console.log(item)
//     // item.store = inventory.store._id
//      await TransferItem.create(item);
//   }

//   // Send success response
//   res.status(200).json({
//     status: 'success',
//     message: 'Transfer and Transfer item have been updated successfully.',
//   });

// })




exports.submitRequist = catchAsync(async (req, res, next) => {
  const user = req.user;
  const reqId = req.body.transferId;
  const items = req.body.items;

  if (!items || items.length === 0) {
    return next(new AppError("Please select Item First!", 400));
  }

  // 1️⃣ Validate transfer existence and status
  const transfer = await Transfer.findById(reqId);
  if (!transfer) return next(new AppError("Transfer request not found.", 404));

  if (transfer.status !== "open") {
    return next(new AppError("This Transfer is already submitted!", 400));
  }

  // 2️⃣ Update transfer status to 'submit'
  transfer.status = "submit";
  await transfer.save();

  // 3️⃣ Loop through each transfer item
  for (const item of items) {
    // 🟢 Check for duplicate transfer item
    const existingItem = await TransferItem.findOne({
      transfer: reqId,
      inventory: item.inventory,
    });

    if (existingItem) {
      console.log(`⚠️ Item already exists for transferId: ${reqId}, inventory: ${item.inventory}`);
      continue;
    }

    // 🟢 Validate inventory
    const inventory = await Inventory.findById(item.inventory);
    if (!inventory)
      return next(new AppError(`Inventory item with ID ${item.inventory} not found.`, 404));

    // 🟢 Validate quantity
    if (item.transferQty > inventory.currentStock)
      return next(new AppError("Transfer quantity should be less than current stock.", 400));

    // 🟢 Prevent direct status change
    if (item.status)
      return next(new AppError("This route is not for status change!", 400));

    // 4️⃣ Create new transfer item
    const newItem = {
      user: user._id,
      transfer: reqId,
      inventory: item.inventory,
      to: transfer.storeTo._id,
      from: transfer.storeFrom._id,
      status: "pending",
      transferDate: new Date(),
      transferQty: item.transferQty,
      assets: Array.isArray(item.assets) ? item.assets : [],
    };

    await TransferItem.create(newItem);

    // 5️⃣ ✨ Update asset status to "Transition"
    if (Array.isArray(item.assets) && item.assets.length > 0) {
      console.log(`🛠 Updating ${item.assets.length} assets to "Transition" status...`);

      const assetIds = item.assets.map((id) => new mongoose.Types.ObjectId(id));

      // 🔒 Force update using $set with strict:false and bypassDocumentValidation
      const result = await Asset.updateMany(
        { _id: { $in: assetIds } },
        { $set: { status: "Transition" } },
        { strict: false, timestamps: false }
      );

      console.log(
        `✅ Asset status update — matched: ${result.matchedCount || 0}, modified: ${result.modifiedCount || 0}`
      );

      // 🧠 Verify by fetching one record
      const verifyOne = await Asset.findOne({ _id: assetIds[0] }).select("serialNumber status");
      console.log("🧩 Asset status check:", verifyOne);
    }
  }

  // 6️⃣ Respond success
  res.status(200).json({
    status: "success",
    message: "Transfer submitted and related asset statuses updated successfully.",
  });
});




exports.getInventoryItem = factory.getAll(Request);

exports.updateRequestItem = catchAsync(async(req,res,next)=>{
  console.log(req.body)
  let body = {}
   if(req.user.role !== 'admin'){
      body = req.body
   }else{
      body.status = 'submit'
   }

   console.log("b9d",body)
   const doc = await Transfer.findByIdAndUpdate(req.params.id, body, { new: true, runValidators: true });

   console.log("res",doc)
   res.status(201).json({
    status: 'success',
    data: {
      data: doc
    }
  });

});
exports.deleteInventroyItem = factory.deleteOne(Request);
