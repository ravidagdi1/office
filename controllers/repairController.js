const RepairRequest = require('../models/repairRequestModel');
const RepairItem = require('../models/repairItemModel');
const Inventory = require('../models/inventoryModel');
const AppError = require('../utils/appError');
const catchAsync = require('../utils/catchAsync');
const Masterlist=require('../models/masterListModel')


exports.newSubmitRepairRequest = catchAsync(async (req, res, next) => {
  const user = req.user;
  const items = req.body.items;
  const storeId = req.body.store;

  // ------------------ BASIC REQUEST VALIDATION ------------------
  if (!storeId) return next(new AppError("Store is required!", 400));
  if (!items || items.length === 0)
    return next(new AppError("Please add at least one repair item!", 400));

  // ------------------ INVENTORY COMES FROM FIRST ROW ONLY ------------------
  const inventoryId = items[0].inventory;
  if (!inventoryId)
    return next(new AppError("Inventory selection is required!", 400));

  // ------------------ Check inventory exists ------------------
  const inventory = await Inventory.findById(inventoryId);
  if (!inventory)
    return next(new AppError("Selected inventory not found!", 404));

  // ------------------ GENERATE REPAIR ORDER NUMBER ------------------
  const lastRequest = await RepairRequest.findOne().sort({ repairOrderNo: -1 });
  const newRepairNo = lastRequest ? lastRequest.repairOrderNo + 1 : 50001;

  // ------------------ CREATE MAIN REPAIR REQUEST ------------------
  const newRepair = await RepairRequest.create({
    repairOrderNo: newRepairNo,
    store: storeId,
    user: user._id,
    inventory: inventoryId,
    status: "submit",
  });

  const orderId = newRepair._id;

  // ------------------ INSERT REPAIR ITEMS ------------------
  for (const item of items) {
    // Validate quantity
    if (!item.qtyRequired || item.qtyRequired <= 0)
      return next(new AppError("Repair qty must be greater than zero", 400));

    // Validate masterlist
    if (!item.masterlist)
      return next(new AppError("Masterlist is required for each item", 400));

    const masterlist = await Masterlist.findById(item.masterlist);
    if (!masterlist)
      return next(
        new AppError(`Masterlist item ${item.masterlist} not found`, 404)
      );

    // Prevent duplicate masterlist items inside same repair
    const exists = await RepairItem.findOne({
      repairOrder: orderId,
      masterlist: item.masterlist,
    });

    if (exists) continue;

    // Create Repair Item
    await RepairItem.create({
      repairOrder: orderId,
      inventory: inventoryId,
      masterlist: item.masterlist,
      qtyRequired: item.qtyRequired,
      store: storeId,
      user: user._id,
      status: "pending",
    });
  }

  // ------------------ RESPONSE ------------------
  res.status(200).json({
    status: "success",
    message: "Repair request submitted successfully.",
    data: {
      repairOrderNo: newRepairNo,
      repairId: orderId,
    },
  });
});


exports.getRequest = catchAsync(async (req,res,next)=>{
  
  const user = req.user;
  console.log("user ",req.query.query)
  console.log("user", req.query.status)
  console.log("user 2",user)
  let filter = {};

  
    if(req.query.status === "undefined"){
    filter = {store:req.query.query ,status:"open"}
    }else{
      filter = {store:req.query.query ,status:req.query.status}
    } 
   
  const doc = await RepairRequest.find(filter)

  res.status(201).json({
    status: 'success',
    data: {
      data: doc
    }
  });
})



