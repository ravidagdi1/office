
const { generateReport } = require("../utils/reportBuilder");
const Request = require('../models/requestedModel');
const factory = require('./handlerFactory');
const catchAsync = require('../utils/catchAsync');
const User = require('../models/userModel');
const Inventory = require('../models/inventoryModel');
const UsedItem =  require('../models/usedItemModel');

const AppError = require('../utils/appError');
const multer = require('multer');
const sharp = require('sharp');
const fs  = require('fs');
const Miv = require('../models/MivFormModel');
const path = require('path');
const formatDate = (date) =>
  date ? new Date(date).toISOString().split("T")[0] : "";


// ✅ 1. Use memory storage so files are processed in memory (no disk save initially)
const multerStorage = multer.memoryStorage();

// ✅ 2. Accept only images
const multerFilter = (req, file, cb) => {
  if (file.mimetype.startsWith('image')) {
    console.log(file); // Optional debug log
    cb(null, true);
  } else {
    cb(new AppError('Not an image! Please upload only images.', 400), false);
  }
};

// ✅ 3. Set up multer upload
const upload = multer({
  storage: multerStorage,
  fileFilter: multerFilter
});

// ✅ 4. Middleware to handle upload from form field named 'image'
exports.uploadProductPhoto = upload.single('image');

// ✅ 5. Middleware to resize image and save to correct folder
exports.resizeProductPhoto = catchAsync(async (req, res, next) => {
  if (!req.file) return next(); // Skip if no file uploaded

  const filename = `product-${Date.now()}.jpeg`;
  const outputDir = path.join(__dirname, '../public/img/requisitionform');
  const outputPath = path.join(outputDir, filename);

  // ✅ Create the directory if it doesn’t exist
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  // ✅ Resize and save the image
  await sharp(req.file.buffer)
    .resize({ width: 800 }) // Keep consistent with old code
    .toFormat('jpeg')
    .jpeg({ quality: 70, mozjpeg: true, progressive: true }) // Match existing quality setting
    .toFile(outputPath);

  // ✅ Attach file name to request body for controller
  req.body.fileName = filename;

  next();
});



exports.createItem = catchAsync(async (req, res, next) => {
    
    console.log('req',req.body)
    const inventory = await Inventory.findById(req.body.inventory);
    
    if(req.body.status){
      return next(new AppError('This route is not for Status Change !'))
    }
    if(req.body.usedQty  > inventory.currentStock){
      console.log("check1")
      return next(new AppError('Used Qty should be less then Current Stock'))
    }
    req.body.user = req.user._id;
    req.body.miv = req.body.mivNo;
    console.log(req.body)

    const doc = await UsedItem.create(req.body);
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
exports.getAllItem = catchAsync(async (req,res,next)=>{

  const user = req.user;
  let filter = {};

  
 filter = {miv : req.query.query , status:req.query.status }

  console.log("filter",filter)
  const doc = await UsedItem.find(filter)
  console.log(doc)
  res.status(201).json({
    status: 'success',
    data: {
      data: doc
    }
  });
})
exports.getInventoryItem = factory.getAll(Request);



exports.getUsedItemByMiv = catchAsync(async (req, res, next) => {
  const mivId = req.params.miv;

  if (!mivId) {
    return next(new AppError('MIV ID is required in the request params', 400));
  }

  const usedItems = await UsedItem.find({ miv: mivId }).sort({ createdAt: -1 });;

    res.status(200).json({
    status: 'success',
    results: usedItems.length,
    data: usedItems,
  });

  
});



exports.updateRequestItem = catchAsync(async (req, res, next) => {
  // Prepare the update body based on user role
  let body = {};
  if (req.user.role == 'admin' || req.user.role == 'superAdmin') {
    body.status = req.body.status;
    body.approveQty = req.body.approveQty
    body.approveBy = req.user._id;
  } else {
    body = {};
  }



  // Update the item first
  const doc = await UsedItem.findByIdAndUpdate(req.params.id, body, { new: true, runValidators: true });

  console.log(doc)
  
  if (!doc) {
    return next(new AppError('No item found with that ID', 404));
  }

  if(body.status ===  'approved' || body.status === 'rejected'){
    const item = await UsedItem.find({miv:doc.miv._id,status:"pending"})

  
    console.log('check1 ',item)
    if(item.length === 0){
      console.log('check2')
      await Miv.findByIdAndUpdate(doc.miv._id,{status:'close'})
    }
  }

  // Check if qtyUsed and status are present and status is 'approved'
  if (body.status === 'approved') {
    // Find the related inventory and update it
    const inventory = await Inventory.findById(doc.inventory._id);

    if (!inventory) {
      return next(new AppError('No inventory found for this item', 404));
    }

   

    // Ensure that qtyUsed is valid and does not exceed current stock
    if (doc.approveQty > inventory.currentStock) {
      return next(new AppError('Used quantity exceeds available stock', 400));
    }

    // Update inventory current stock
    inventory.currentStock -= Number(body.approveQty);
    inventory.totalMiv += Number(body.approveQty) 

    // Save the updated inventory
    await inventory.save();

   
  }

  // Send the response
  res.status(200).json({
    status: 'success',
    data: {
      item: doc,
    },
  });
});

// Controller to fetch items based on storeId, status, and date range
exports.getItemsByStoreStatusDate = async (req, res) => {
  try {
    // Extract parameters from the request
    const { fromDate, toDate,status } = req.body;


    // Ensure 'fromDate' and 'toDate' are provided, and parse them into Date objects
    const from = fromDate ? new Date(fromDate) : new Date(); // Default to a very early date if not provided
    const to = toDate ? new Date(toDate) : new Date(); // Default to the current date if not provided

    // Validate dates
    if (isNaN(from) || isNaN(to)) {
      return next(new AppError('Invalid Date Formate', 404));
    }

    // Build the query
    const startOfDay = new Date(from).setHours(0, 0, 0, 0); // Start of the day
    const endOfDay = new Date(to).setHours(23, 59, 59, 999); // End of the day

    const query = {
      createdAt: { $gte: new Date(startOfDay), $lte: new Date(endOfDay) }, // Full-day range
    };
    
    // Add status condition if it's provided (and not 'all')
    if (status && status !== "all") {
      query.status = status; // Filter by specific status
    }
    
    
    // Find items that match the query
    const items = await UsedItem.find(query);

        // Get the total count of records matching the query
        const totalCount = await UsedItem.countDocuments(query);


    // Return the response with the fetched items
    return res.status(200).json({
      status: 'success',
      data: items,
      count:totalCount
    });
  } catch (error) {
    console.error('Error fetching items:', error);
    return res.status(500).json({
      status: 'error',
      message: error.message || 'An error occurred while fetching the items.',
    });
  }
};


// Controller to fetch count of items based on storeId, status, and date range
exports.getGrpopItemsByStoreStatusDate = async (req, res) => {
  try {
    const { fromDate, toDate,status} = req.body;

    const from = fromDate ? new Date(fromDate) : new Date();
    const to = toDate ? new Date(toDate) : new Date();

    if (isNaN(from) || isNaN(to)) {
      return next(new AppError('Invalid Date Format', 404));
    }

    const startOfDay = new Date(from).setHours(0, 0, 0, 0);
    const endOfDay = new Date(to).setHours(23, 59, 59, 999);

    // Aggregation query
    const aggregatedData = await UsedItem.aggregate([
      // Step 1: Match UsedItem documents by date range
      {
        $match: {
          createdAt: { $gte: new Date(startOfDay), $lte: new Date(endOfDay) },
        },
      },
      // Step 2: Lookup to join with Inventory data
      {
        $lookup: {
          from: 'inventories', // MongoDB collection name for Inventory
          localField: 'inventory', // Field in UsedItem
          foreignField: '_id', // Field in Inventory
          as: 'inventoryData', // Output array
        },
      },
      // Step 3: Unwind the inventoryData array
      {
        $unwind: {
          path: '$inventoryData',
          preserveNullAndEmptyArrays: false, // Exclude documents without inventoryData
        },
      },
      // Step 4: Lookup to join with Store data
      {
        $lookup: {
          from: 'stores', // MongoDB collection name for Store
          localField: 'inventoryData.store', // Field in Inventory
          foreignField: '_id', // Field in Store
          as: 'storeData', // Output array
        },
      },
      // Step 5: Unwind the storeData array
      {
        $unwind: {
          path: '$storeData',
          preserveNullAndEmptyArrays: false, // Exclude documents without storeData
        },
      },
      // Step 6: Lookup to join with MasterList to get partNo
      {
        $lookup: {
          from: 'masterlists', // MongoDB collection name for MasterList
          localField: 'inventoryData.masterItem', // Field in Inventory
          foreignField: '_id', // Field in MasterList
          as: 'masterItemData', // Output array
        },
      },
      // Step 7: Unwind the masterItemData array
      {
        $unwind: {
          path: '$masterItemData',
          preserveNullAndEmptyArrays: false, // Exclude documents without masterItemData
        },
      },
      // Step 8: Lookup to join with Miv to get mivNo
      {
        $lookup: {
          from: 'mivs', // MongoDB collection name for Miv
          localField: 'miv', // Field in UsedItem
          foreignField: '_id', // Field in Miv
          as: 'mivData', // Output array
        },
      },
      // Step 9: Unwind the mivData array
      {
        $unwind: {
          path: '$mivData',
          preserveNullAndEmptyArrays: false, // Exclude documents without mivData
        },
      },
      // Step 10: Group by Store and collect item details
      {
        $group: {
          _id: '$storeData._id', // Group by Store ID
          storeName: { $first: '$storeData.name' }, // Store Name
          location: { $first: '$storeData.location' }, // Store Location
          itemCount: { $sum: 1 }, // Count items
          items: {
            $push: {
              usedItemId: '$_id', // UsedItem ID
              usedQty: '$usedQty', // Used Quantity
              status: '$status', // Item Status
              approveQty: '$approveQty',
              inventoryId: '$inventoryData._id', // Inventory ID
              partNo: '$masterItemData.partNo', // Part Number from MasterList
              description: '$masterItemData.description', // Description from MasterList
              mivNo: '$mivData.mivNo', // Miv Number,
              updatedAt:'$updatedAt'
            },
          },
        },
      },
      // Step 11: Sort by Store Name (optional)
      {
        $sort: { storeName: 1 },
      },
    ]);
    
  

    return res.status(200).json({
      status: 'success',
      data: aggregatedData,
    });
  } catch (error) {
    console.error('Error fetching items:', error);
    return res.status(500).json({
      status: 'error',
      message: error.message || 'An error occurred while fetching the items.',
    });
  }
};



exports.downloadMIVReport = async (req, res) => {
  const { fromDate, toDate, status } = req.body;

  const fileName = "MIV_Report.xlsx";

  const from = fromDate ? new Date(fromDate) : new Date(0);
  const to = toDate ? new Date(toDate) : new Date();

  if (isNaN(from.getTime()) || isNaN(to.getTime())) {
    return generateReport({
      model: UsedItem,
      res,
      query: {},
      mapFunction: () => ({
        Message: "Invalid Date Range",
      }),
      fileName,
      options: { skipPopulate: true }, // ✅ IMPORTANT
    });
  }

  from.setHours(0, 0, 0, 0);
  to.setHours(23, 59, 59, 999);

  const query = {
    createdAt: { $gte: from, $lte: to },
  };

  if (status && status !== "all") {
    query.status = status;
  }

  return generateReport({
    model: UsedItem,
    query,

    // ✅ Skip middleware populate
    options: { skipPopulate: true },

    select:
      "inventory miv status createdAt usedQty approveQty user",

    populate: [
      {
        path: "inventory",
        select: "currentStock masterItem store",
        populate: [
          {
            path: "masterItem",
            select: "partNo description unit",
            populate: { path: "unit", select: "name" },
          },
          {
            path: "store",
            select: "name",
          },
        ],
      },
      {
        path: "user",
        select: "name",
      },
      {
        path: "miv",
        select: "mivNo",
      },
    ],

    fileName,

    mapFunction: (item, index) => ({
      "S.No": index + 1,
      "Date": formatDate(item?.createdAt),
      "MIV No": item?.miv?.mivNo || "",
      "Store": item?.inventory?.store?.name || "",
      "Part No": item?.inventory?.masterItem?.partNo || "",
      "Description": item?.inventory?.masterItem?.description || "",
      "Unit": item?.inventory?.masterItem?.unit?.name || "",
      "Used Qty": item?.usedQty || 0,
      "Approved Qty": item?.approveQty || 0,
      "Current Stock": item?.inventory?.currentStock || 0,
      "Status": item?.status || "",
      "Issued By": item?.user?.name || "",
    }),

    res,
  });
};


exports.deleteInventroyItem = factory.deleteOne(Request);
