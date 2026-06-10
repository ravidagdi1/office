const Inventory = require('../models/inventoryModel');
const factory = require('./handlerFactory');
const catchAsync = require('../utils/catchAsync');
const User = require('../models/userModel');
const AppError = require('../utils/appError');


exports.createInventoryItem = catchAsync(async (req, res, next) => {
    console.log("hellog",req.user)
    req.body.user = req.user;
    console.log(req.body)
    const doc = await Inventory.create(req.body);
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
exports.getAllInventory = catchAsync(async (req,res,next)=>{
 console.log("query",req.query.query)
  const user = req.user;
 
  let filter = {};

  if(!req.query.query){
    return next(new AppError('No document found with that ID', 404));
  }else{
    filter = {store:req.query.query}
  }
  const inventory = await Inventory.find(filter)

  res.status(201).json({
    status: 'success',
    data: {
      data: inventory
    }
  });
})

exports.getDesilInventory = catchAsync(async (req,res,next)=>{
 console.log("query",req.query.query)

 
  let filter = {};
  
  if(!req.query.query){
    return next(new AppError('No document found with that ID', 404));
  }else{
    filter = {store:req.query.query , masterItem:'671a11ad0f507b916bff8a9b' }
  }
  const inventory = await Inventory.find(filter)

  res.status(201).json({
    status: 'success',
    data: {
      data: inventory
    }
  });
})

//masterlist and inventory

exports.getInventoryByMasterItem = catchAsync(async (req, res, next) => {
  const masterId = req.query.query;

  if (!masterId) {
    return next(new AppError('Master Item ID is required', 400));
  }

  let inventory = await Inventory.find({
    masterItem: masterId,
    currentStock: { $gt: 0 }
  })
    .select('currentStock store') // Only request needed fields
    .lean(); // ✅ Disable Mongoose documents, get plain objects

  // ✅ Remove unwanted fields (like user, masterItem)
  inventory = inventory.map(item => ({
    _id: item._id,
    currentStock: item.currentStock,
    store: {
      _id: item.store?._id,
      name: item.store?.name,
      location: item.store?.location,
      storeCode: item.store?.storeCode
    }
  }));

  if (!inventory || inventory.length === 0) {
    return next(new AppError('No inventory found with stock for this master item.', 404));
  }

  res.status(200).json({
    status: 'success',
    results: inventory.length,
    data: inventory,
  });
});





exports.getInventoryItem = factory.getAll(Inventory);

exports.updateInvetoryItem = factory.updateOne(Inventory);
exports.deleteInventroyItem = factory.deleteOne(Inventory);







