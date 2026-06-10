
const Request = require('../models/requestedModel');
const factory = require('./handlerFactory');
const catchAsync = require('../utils/catchAsync');
const User = require('../models/userModel');
const Inventory = require('../models/inventoryModel');
const AppError = require('../utils/appError');
const multer = require('multer');
const sharp = require('sharp');
const Item = require('../models/itemModel');
const Mrv = require('../models/mtnFormModel');
const fs = require('fs')
const TransferItem = require('../models/transferItemModel')
const Asset = require('../models/assetModel')
const path = require('path');

// ✅ Use memory storage (file saved in buffer)
const multerStorage = multer.memoryStorage();

// ✅ Filter only image uploads
const multerFilter = (req, file, cb) => {
  if (file.mimetype.startsWith('image')) {
    cb(null, true);
  } else {
    cb(new AppError('Not an image! Please upload only images.', 400), false);
  }
};

// ✅ Initialize multer with memory storage & filter
const upload = multer({
  storage: multerStorage,
  fileFilter: multerFilter
});

// ✅ Middleware to handle single file upload
exports.uploadProductPhoto = upload.single('image');

// ✅ Resize, compress, and save image to `public/img/mrv`
exports.resizeProductPhoto = catchAsync(async (req, res, next) => {
  if (!req.file) return next(); // Skip if no file uploaded

  const filename = `mrv-${Date.now()}.jpeg`;
  const outputPath = path.join(__dirname, '../public/img/mrv', filename);

  // ✅ Use sharp to resize and compress before saving
  await sharp(req.file.buffer)
    .resize({ width: 800 }) // Resize width to 800px
    .toFormat('jpeg')
    .jpeg({ quality: 70, mozjpeg: true, progressive: true })
    .toFile(outputPath);

  // ✅ Pass final filename to next middleware/controller
  req.body.fileName = filename;
  next();
});


exports.createMrv = catchAsync(async (req, res, next) => {

  req.body.user = req.user._id;
  req.body.image = req.body.fileName

  const doc = await Mrv.create(req.body);
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
exports.getAllMrv = catchAsync(async (req, res, next) => {

  const user = req.user;
  console.log("user ", req.query.query)
  console.log("user 2", user)
  let filter = {};


  filter = { store: req.query.query, status: "open" }

  const doc = await Mrv.find(filter)

  res.status(201).json({
    status: 'success',
    data: {
      data: doc
    }
  });
})





exports.getSingleMrv = factory.getAll(Mrv);

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

//chnaged on 23-august-2025
/*
exports.submitTransferMrv = catchAsync(async (req, res, next) => {
  console.log(req.body)

  const mrvId = req.body.mrvId;
  const items = req.body.items;

  const mrv = await Mrv.findById(mrvId)
  if (!mrv) {

    return next(new AppError('No MTN found for this Id', 404));

  }

  if (mrv.status !== 'open') {
    return next(new AppError('This MTN is already submitted!', 400));
  }
  for (const item of items) {
    let doc;

    if ((Number(item.damageQty) + Number(item.recived)) <= Number(item.approvedTransfer)) {
      console.log("if ", item)
      doc = await TransferItem.findByIdAndUpdate(item.id, { status: "recived", recived: Number(item.recived), damageQty: Number(item.damageQty), mrv: mrvId })

    } else {
      return next(new AppError('please fill properly', 404))
    }

    // Now find the related inventory and update it
    const inventory = await Inventory.findById(doc.inventory._id);

    console.log("inventory", inventory)
    if (!inventory) {
      return next(new AppError('No inventory found for this item', 404));
    }

    let inventorySend = await Inventory.findOne({ store: doc.to, masterItem: inventory.masterItem._id })

    console.log("to", inventorySend)

    if (!inventorySend) {
      // return next(new AppError('Store dont have this inventory', 404));
      inventorySend = await Inventory.create({
        masterItem: inventory.masterItem._id,
        store: doc.to,
        user: req.user,
        qtyAuth: item.recived,
        criticalStockQty: 0,
        reqestedQty: 0,
        reciveQty: 0,
        damage: 0,
        totalRecive: 0,
        transfer: 0,
        currentStock: 0,
        totalMiv: 0,
        lp: 0,
        remark: "Genrated at the time of recived Transfer"
      })
    }
    console.log("newinv", inventorySend)
    inventorySend.reciveQty = Number(item.recived);  // Add received quantity to current stock
    inventorySend.totalRecive += Number(item.recived);   // Update the total received quantity
    // inventory.reqestedQty = item.transferQty;
    inventorySend.currentStock += Number(item.recived);
    inventorySend.damage += Number(item.damageQty)



    // // You can update other fields like `lp`, `totalMiv`, etc. here if needed

    await inventorySend.save();

    inventory.transfer += Number(item.recived) + Number(item.damageQty);
// added this line for transition qty 
    inventory.transitionQty -= (Number(item.recived) + Number(item.damageQty));
    doc.inventoryTo = inventorySend._id;


    await inventory.save();
  }
  mrv.status = "close"
  await mrv.save()
  res.status(201).json({
    status: 'success',
    message: 'successfully submited !'
  });

})
  */



{ /* exports.submitTransferMrv = catchAsync(async (req, res, next) => {
  console.log(req.body);

  const mrvId = req.body.mrvId;
  const items = req.body.items;

  const mrv = await Mrv.findById(mrvId);
  if (!mrv) {
    return next(new AppError('No MTN found for this Id', 404));
  }

  if (mrv.status !== 'open') {
    return next(new AppError('This MTN is already submitted!', 400));
  }

  for (const item of items) {
    // 🔎 First fetch the transfer item
    let doc = await TransferItem.findById(item.id);
    if (!doc) {
      return next(new AppError('Transfer item not found', 404));
    }

    // ✅ Skip if already received  recived
    if (doc.status === "recived") {
      console.log(`Item ${doc._id} already received, skipping...`);
      continue;
    }

    // ✅ Validate qty
    if ((Number(item.damageQty) + Number(item.recived)) <= Number(item.approvedTransfer)) {
      console.log("Processing item:", item);

      doc.status = "recived";
      doc.recived = Number(item.recived);
      doc.damageQty = Number(item.damageQty);
      doc.mrv = mrvId;
      await doc.save();
    } else {
      return next(new AppError('Please fill quantities properly', 404));
    }

    // 🔎 Now update inventory
    const inventory = await Inventory.findById(doc.inventory._id);
    if (!inventory) {
      return next(new AppError('No inventory found for this item', 404));
    }

    let inventorySend = await Inventory.findOne({ 
      store: doc.to, 
      masterItem: inventory.masterItem._id 
    });

    if (!inventorySend) {
      inventorySend = await Inventory.create({
        masterItem: inventory.masterItem._id,
        store: doc.to,
        user: req.user,
        qtyAuth: item.recived,
        criticalStockQty: 0,
        reqestedQty: 0,
        reciveQty: 0,
        damage: 0,
        totalRecive: 0,
        transfer: 0,
        currentStock: 0,
        totalMiv: 0,
        lp: 0,
        remark: "Generated at the time of received Transfer"
      });
    }

    // Update receiving store inventory
    inventorySend.reciveQty = Number(item.recived);  
    inventorySend.totalRecive += Number(item.recived);   
    inventorySend.currentStock += Number(item.recived);
    inventorySend.damage += Number(item.damageQty);
    await inventorySend.save();

    // Update sending store inventory
    inventory.transfer += Number(item.recived) + Number(item.damageQty);
    inventory.transitionQty -= (Number(item.recived) + Number(item.damageQty));
    doc.inventoryTo = inventorySend._id;
    await inventory.save();
  }

  // ✅ Close MRV only if all items are received recived
  const pending = await TransferItem.find({ mrv: mrvId, status: { $ne: "recived" } });
  if (pending.length === 0) {
    mrv.status = "close";
    await mrv.save();
  }

  res.status(201).json({
    status: 'success',
    message: 'Successfully submitted!'
  });
});

*/}


{/*
exports.submitTransferMrvoldlatest = catchAsync(async (req, res, next) => {


  const { mrvId, items } = req.body;

  const mrv = await Mrv.findById(mrvId);
  if (!mrv) return next(new AppError('No MTN found for this Id', 404));

  if (mrv.status !== 'open')
    return next(new AppError('This MTN is already submitted!', 400));

  for (const item of items) {
    // 🔎 Fetch the Transfer Item
    const doc = await TransferItem.findById(item.id);
    if (!doc) return next(new AppError('Transfer item not found', 404));

    // ✅ Skip if already received
    if (doc.status === "recived") {
      console.log(`Item ${doc._id} already received, skipping...`);
      continue;
    }

    // ✅ Validate quantity
    const approved = Number(item.approvedTransfer || 0);
    const received = Number(item.recived || 0);
    const damaged = 0; // force ignore frontend

    if (received > approved)
      return next(new AppError('Please fill quantities properly', 400));

    console.log("Processing item:", item);

    // ✅ Update TransferItem
    doc.status = "recived";
    doc.recived = received;
    doc.damageQty = damaged;
    doc.mrv = mrvId;
    await doc.save();

    // 🔎 Update Inventory (sending store)
    const inventory = await Inventory.findById(doc.inventory);
    if (!inventory)
      return next(new AppError('No inventory found for this item', 404));

    // 🏬 Find or create destination inventory (received store)
    let inventorySend = await Inventory.findOne({
      store: doc.to,
      masterItem: inventory.masterItem,
    });

    if (!inventorySend) {
      inventorySend = await Inventory.create({
        masterItem: inventory.masterItem,
        store: doc.to,
        user: req.user,
        qtyAuth: received,
        criticalStockQty: 0,
        reqestedQty: 0,
        reciveQty: 0,
        damage: 0,
        totalRecive: 0,
        transfer: 0,
        currentStock: 0,
        totalMiv: 0,
        lp: 0,
        remark: "Generated at the time of received Transfer",
      });
    }

    // ✅ Update destination store inventory quantities
    inventorySend.reciveQty = received;
    inventorySend.totalRecive += received;
    inventorySend.currentStock += received;
    inventorySend.damage += damaged;
    await inventorySend.save();

    // ✅ Update sending store inventory
    inventory.transfer += received + damaged;
    inventory.transitionQty -= received + damaged;
    doc.inventoryTo = inventorySend._id;
    await inventory.save();

    // ✨ Move Assets (if TransferItem has assets)
    if (Array.isArray(doc.assets) && doc.assets.length > 0) {
      const fromStoreId = doc.from?._id || doc.from;
      const toStoreId = doc.to?._id || doc.to;

      if (!toStoreId) {
        console.warn(`⚠️ Missing destination store for transfer item ${doc._id}`);
        continue;
      }

      console.log(`🔄 Moving ${doc.assets.length} assets from store ${fromStoreId} ➡️ ${toStoreId}`);

      // ✅ Update both store, inventory, and status in Asset
      const result = await Asset.updateMany(
        { _id: { $in: doc.assets } },
        {
          $set: {
            store: toStoreId,             // update store to received store
            inventory: inventorySend._id, // update inventory to new destination inventory
            status: "Available",          // ✅ reset asset status to Available
          },
        }
      );

      console.log(
        `✅ Asset update: matched ${result.matchedCount}, modified ${result.modifiedCount}, set status to Available`
      );
    }
  }

  // ✅ Close MRV only if all items are received
  const pending = await TransferItem.find({
    mrv: mrvId,
    status: { $ne: "recived" },
  });

  if (pending.length === 0) {
    mrv.status = "close";
    await mrv.save();
  }

  res.status(201).json({
    status: 'success',
    message: 'Successfully submitted! Asset status updated to Available.',
  });
});

*/}

exports.submitTransferMrv = catchAsync(async (req, res, next) => {

  const { mrvId, items } = req.body;

  const mrv = await Mrv.findById(mrvId);

  if (!mrv)
    return next(new AppError('No MTN found for this Id', 404));

  if (mrv.status !== 'open')
    return next(new AppError('This MTN is already submitted!', 400));

  for (const item of items) {

    // 🔎 Fetch Transfer Item
    const doc = await TransferItem.findById(item.id);

    if (!doc)
      return next(new AppError('Transfer item not found', 404));

    // ✅ Skip already received item
    if (doc.status === "recived") {
      console.log(`Item ${doc._id} already received, skipping...`);
      continue;
    }

    // ✅ Validate Qty
    const approved = Number(Number(item.approvedTransfer || 0).toFixed(2));
    const received = Number(Number(item.recived || 0).toFixed(2));
    const damaged = 0;

   if (received !== approved) {
  return next(
    new AppError(
      'Received Qty must be equal to Approved Qty',
      400
    )
  );
}

    console.log("Processing item:", item);

    // ✅ Calculate remaining qty
    const remainQty = Number(
      (approved - (received + damaged)).toFixed(2)
    );

    // ✅ Update Transfer Item
    doc.status = "recived";
    doc.recived = received;
    doc.damageQty = damaged;
    doc.mrv = mrvId;

    await doc.save();

    // ✅ Create remain transfer item
    if (remainQty > 0) {

      await TransferItem.create({
        inventory: doc.inventory,
        transfer: doc.transfer,
        user: doc.user,
        to: doc.to,
        from: doc.from,

        transferQty: remainQty,
        approveQty: remainQty,

        transferDate: doc.transferDate,
        approveBy: doc.approveBy,

        assets: [],
        // ✅ mark remain item
        flag: "remain",

        status: "approved",
      });

      console.log(`✅ Remaining transfer item created: ${remainQty}`);
    }

    // 🔎 Find sending inventory
    const inventory = await Inventory.findById(doc.inventory);

    if (!inventory)
      return next(new AppError('No inventory found for this item', 404));

    // 🏬 Find or create destination inventory
    let inventorySend = await Inventory.findOne({
      store: doc.to,
      masterItem: inventory.masterItem,
    });

    // ✅ Create destination inventory if not exists
    if (!inventorySend) {

      inventorySend = await Inventory.create({
        masterItem: inventory.masterItem,
        store: doc.to,
        user: req.user,

        qtyAuth: received,
        criticalStockQty: 0,
        reqestedQty: 0,
        reciveQty: 0,
        damage: 0,
        totalRecive: 0,
        transfer: 0,
        currentStock: 0,
        totalMiv: 0,
        lp: 0,

        remark: "Generated at the time of received Transfer",
      });
    }

    // ✅ Update destination inventory
    inventorySend.reciveQty = received;
    inventorySend.totalRecive += received;
    inventorySend.currentStock += received;
    inventorySend.damage += damaged;

    await inventorySend.save();

    // ✅ Update source inventory
    inventory.transfer += received + damaged;
    inventory.transitionQty -= received + damaged;

    doc.inventoryTo = inventorySend._id;

    await doc.save();
    await inventory.save();

    // ✨ Move Assets
    if (Array.isArray(doc.assets) && doc.assets.length > 0) {

      const fromStoreId = doc.from?._id || doc.from;
      const toStoreId = doc.to?._id || doc.to;

      if (!toStoreId) {
        console.warn(
          `⚠️ Missing destination store for transfer item ${doc._id}`
        );
        continue;
      }

      console.log(
        `🔄 Moving ${doc.assets.length} assets from store ${fromStoreId} ➡️ ${toStoreId}`
      );

      // ✅ Update assets
      const result = await Asset.updateMany(
        { _id: { $in: doc.assets } },
        {
          $set: {
            store: toStoreId,
            inventory: inventorySend._id,
            status: "Available",
          },
        }
      );

      console.log(
        `✅ Asset update: matched ${result.matchedCount}, modified ${result.modifiedCount}`
      );
    }
  }

  // ✅ Close MRV only if all transfer items are received
  const pending = await TransferItem.find({
    transfer: mrv.transfer,
    status: { $ne: "recived" },
  });

  if (pending.length === 0) {

    mrv.status = "close";

    await mrv.save();
  }

  res.status(201).json({
    status: 'success',
    message: 'Successfully submitted! Asset status updated to Available.',
  });

});




