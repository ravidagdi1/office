const multer = require('multer');
const sharp = require('sharp');
const MasterList = require('../models/masterListModel');
const Inventory = require('../models/inventoryModel');
const catchAsync = require('../utils/catchAsync');
const AppError = require('../utils/appError');
const factory = require('./handlerFactory');
const XLSX = require('xlsx');
const csvParser = require('csv-parser');
const fs = require('fs');
const path = require('path');

const multerStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'public/img/product');
  },
  filename: (req, file, cb) => {
    const ext = file.mimetype.split('/')[1];
    cb(null, `product-${Date.now()}.${ext}`);
  }
});
// const multerStorage = multer.memoryStorage();

const multerFilter = (req, file, cb) => {

  if (file.mimetype.startsWith('image')) {
    console.log(file)
    cb(null, true);
  } else {
    cb(new AppError('Not an image! Please upload only images.', 400), false);
  }
};

const upload = multer({
  storage: multerStorage,
  fileFilter: multerFilter
});

exports.uploadProductPhoto = upload.single('photo');

exports.resizeProductPhoto = catchAsync(async (req, res, next) => {
  if (!req.file) return next(); // If no file is uploaded, skip this middleware

  const ext = 'jpeg'; // Convert the image format to jpeg
  const filename = `product-${Date.now()}.${ext}`; // Generate a new filename for the resized image

  // Use sharp to resize the image from the path
  await sharp(req.file.path)
    .toFormat(ext)
    .resize({ width: 800 })
    .jpeg({ quality: 70, mozjpeg: true, progressive: true })
    .toFile(`public/img/product/${filename}`); // Save the resized image to disk

  req.body.image = filename; // Store the new filename in req.body.image for further processing

  next(); // Proceed to the next middleware
});

const filterObj = (obj, ...allowedFields) => {
  const newObj = {};
  Object.keys(obj).forEach(el => {
    if (allowedFields.includes(el)) newObj[el] = obj[el];
  });
  return newObj;
};



// Multer configuration for file uploads
const uploadStorage = multer({ dest: 'uploads/' });

// Controller to handle Excel import
exports.importExcel = (req, res) => {
  const file = req.file;

  if (!file) {
    return res.status(400).json({ message: 'Please upload a file!' });
  }

  const workbook = XLSX.readFile(file.path);
  const sheetName = workbook.SheetNames[0];
  const data = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName]);

  // Remove uploaded file after parsing
  fs.unlinkSync(file.path);

  MasterList.insertMany(data)
    .then(() => res.status(200).json({ message: 'Data imported successfully' }))
    .catch(err => res.status(500).json({ message: 'Import failed', error: err }));
};

// Controller to handle CSV import
exports.importCSV = (req, res) => {
  const file = req.file;

  if (!file) {
    return res.status(400).json({ message: 'Please upload a file!' });
  }

  const results = [];
  fs.createReadStream(file.path)
    .pipe(csvParser())
    .on('data', (data) => results.push(data))
    .on('end', () => {
      fs.unlinkSync(file.path); // Remove uploaded file after parsing

      MasterList.insertMany(results)
        .then(() => res.status(200).json({ message: 'Data imported successfully' }))
        .catch(err => res.status(500).json({ message: 'Import failed', error: err }));
    });
};

// Middleware to upload file
exports.uploadFile = uploadStorage.single('file');

exports.createListItem = factory.createOne(MasterList)

exports.getListItem = factory.getOne(MasterList);
exports.getAllList = factory.getAll(MasterList);


exports.getMasterListByCategory = async (req, res) => {
  try {
    const assetsItems = await MasterList.aggregate([
      {
        $lookup: {
          from: 'categories', // collection name (usually lowercase plural of model)
          localField: 'category',
          foreignField: '_id',
          as: 'category'
        }
      },
      {
        $unwind: '$category'
      },
      {
        $match: {
          'category.name': 'assets'
        }
      },
      {
        $lookup: {
          from: 'units',
          localField: 'unit',
          foreignField: '_id',
          as: 'unit'
        }
      },
      {
        $unwind: '$unit'
      },
      {
        $project: {
          __v: 0,
          'category.__v': 0,
          'unit.__v': 0
        }
      }
    ]);

    res.status(200).json({
      status: 'success',
      results: assetsItems.length,
      data: assetsItems
    });
  } catch (err) {
    res.status(500).json({
      status: 'error',
      message: err.message
    });
  }
};


exports.getDirectiveReport = catchAsync(async (req, res, next) => {
  try {
    // Define the list of part numbers to include
    const allowedPartNumbers = [
      "1058", "1080", "1113", "1044", "1043", "1078", "1071", "1017", "1122", "1148", "1048",
      "1049", "1075", "1076", "1077", "1021", "1022", "1047", "1070", "1089", "1033", "1006",
      "1008", "1010", "1011", "1018", "1072", "1121", "1024", "1025", "1066", "1081", "1046",
      "1063", "1061", "1084", "1030", "1088"
    ];

    // Step 1: Aggregate data from Inventory, including store details and per-store currentStock
    const inventoryData = await Inventory.aggregate([
      {
        $lookup: {
          from: "stores", // The name of the Store collection
          localField: "store", // Field in Inventory that references the Store
          foreignField: "_id", // Field in Store to match
          as: "storeDetails", // Alias for the joined data
        },
      },
      {
        $unwind: "$storeDetails", // Flatten the storeDetails array
      },
      {
        $group: {
          _id: { masterItem: "$masterItem", store: "$storeDetails._id" }, // Group by masterItem and store
          storeName: { $first: "$storeDetails.name" }, // Get the store name
          storeLocation: { $first: "$storeDetails.location" }, // Get the store location
          currentStock: { $sum: "$currentStock" }, // Sum up currentStock for each store
        },
      },
      {
        $match: { currentStock: { $gt: 0 } }, // Exclude stores with currentStock of 0
      },
      {
        $group: {
          _id: "$_id.masterItem", // Group by masterItem only
          totalCurrentStock: { $sum: "$currentStock" }, // Total stock across all stores
          stores: {
            $push: {
              storeId: "$_id.store",
              storeName: "$storeName",
              storeLocation: "$storeLocation",
              currentStock: "$currentStock", // Stock count for this store
            },
          },
        },
      },
    ]);

    // Step 2: Fetch MasterList data with allowed part numbers
    const masterListData = await MasterList.find({
      partNo: { $in: allowedPartNumbers }, // Match only allowed part numbers
    })
      .populate("category", "-__v -active -id") // Populate category
      .populate("unit", "-__v"); // Populate unit

    // Step 3: Combine MasterList data with the aggregated inventory data
    const result = masterListData.map((masterItem) => {
      const updatedMasterItem = { ...masterItem.toObject() }; // Convert Mongoose object to plain object

      // Find the corresponding inventory data by matching _id
      const inventoryItem = inventoryData.find(
        (item) => item._id.toString() === updatedMasterItem._id.toString()
      );

      // Attach totalCurrentStock and stores to the master item
      if (inventoryItem) {
        updatedMasterItem.totalCurrentStock = inventoryItem.totalCurrentStock;
        updatedMasterItem.stores = inventoryItem.stores;
      } else {
        updatedMasterItem.totalCurrentStock = 0;
        updatedMasterItem.stores = [];
      }

      return updatedMasterItem;
    });

    // Step 4: Send the response with the combined data
    res.status(200).json({
      status: "success",
      data: result,
    });
  } catch (error) {
    // Handle errors
    console.error(error);
    return next(new Error("Failed to fetch directive report data"));
  }
});


exports.getIndigoStock = catchAsync(async (req, res, next) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) ||350;
    const search = req.query.search?.trim() || "";

    // Step 1: Build search filter
    let filter = {};

    if (search) {
      const escaped = search.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, "\\$&");

      filter = {
        $or: [
          // Partial match for description
          { description: { $regex: escaped, $options: "i" } },
          // Partial match for partNo (convert number to string)
          {
            $expr: {
              $regexMatch: {
                input: { $toString: "$partNo" },
                regex: escaped,
                options: "i",
              },
            },
          },
        ],
      };
    }

    // Step 2: Fetch filtered MasterList with pagination
    const [masterListData, totalCount] = await Promise.all([
      MasterList.find(filter)
        .populate("category", "-__v -active -id")
        .populate("unit", "-__v")
        .skip((page - 1) * limit)
        .limit(limit),
      MasterList.countDocuments(filter),
    ]);

    // Step 3: Aggregate inventory for filtered master items
    const masterItemIds = masterListData.map((m) => m._id);

    const inventoryData = await Inventory.aggregate([
      { $match: { masterItem: { $in: masterItemIds } } },
      {
        $lookup: {
          from: "stores",
          localField: "store",
          foreignField: "_id",
          as: "storeDetails",
        },
      },
      { $unwind: "$storeDetails" },
      {
        $group: {
          _id: { masterItem: "$masterItem", store: "$storeDetails._id" },
          storeName: { $first: "$storeDetails.name" },
          storeLocation: { $first: "$storeDetails.location" },
          currentStock: { $sum: "$currentStock" },
          transitionQty: { $sum: "$transitionQty" },
        },
      },
      {
        $match: {
          $or: [{ currentStock: { $gt: 0 } }, { transitionQty: { $gt: 0 } }],
        },
      },
      {
        $group: {
          _id: "$_id.masterItem",
          totalCurrentStock: { $sum: "$currentStock" },
          totalTransitionQty: { $sum: "$transitionQty" },
          stores: {
            $push: {
              storeId: "$_id.store",
              storeName: "$storeName",
              storeLocation: "$storeLocation",
              currentStock: "$currentStock",
              transitionQty: "$transitionQty",
              total: { $add: ["$currentStock", "$transitionQty"] },
            },
          },
        },
      },
    ]);

    // Step 4: Merge MasterList + Inventory
    const result = masterListData.map((masterItem) => {
      const updatedMasterItem = { ...masterItem.toObject() };
      const inventoryItem = inventoryData.find(
        (item) => item._id.toString() === updatedMasterItem._id.toString()
      );

      if (inventoryItem) {
        updatedMasterItem.totalCurrentStock = inventoryItem.totalCurrentStock;
        updatedMasterItem.totalTransitionQty = inventoryItem.totalTransitionQty;
        updatedMasterItem.totalStock =
          inventoryItem.totalCurrentStock + inventoryItem.totalTransitionQty;
        updatedMasterItem.stores = inventoryItem.stores;
      } else {
        updatedMasterItem.totalCurrentStock = 0;
        updatedMasterItem.totalTransitionQty = 0;
        updatedMasterItem.totalStock = 0;
        updatedMasterItem.stores = [];
      }

      return updatedMasterItem;
    });

    // Step 5: Return response
    res.status(200).json({
      status: "success",
      totalCount,      // ✅ total filtered count
      currentPage: page,
      totalPages: Math.ceil(totalCount / limit),
      data: result,
    });
  } catch (error) {
    console.error(error);
    return next(new Error("Failed to fetch indigo stock data"));
  }
});






exports.getItemsByCategory = async (req, res) => {
  try {
    const categoryId = req.params.categoryId;
    if (!categoryId) {
      return res.status(400).json({
        status: 'fail',
        message: 'Category ID is required',
      });
    }
    const items = await MasterList.find({ category: categoryId, active: true });
    res.status(200).json({
      status: 'success',
      results: items.length,
      data: {
        items,
      },
    });
  } catch (err) {
    res.status(500).json({
      status: 'error',
      message: err.message,
    });
  }
};







// exports.getAllList = catchAsync(async(req,res,next)=>{
//   const doc =  await MasterList.countDocuments()
// })

// Do NOT update passwords with this!
exports.updateListeItem = factory.updateOne(MasterList);
exports.deleteListeItem = factory.deleteOne(MasterList);


