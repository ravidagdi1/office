const multer = require('multer');
const sharp = require('sharp');
const User = require('./../models/userModel');
const catchAsync = require('./../utils/catchAsync');
const AppError = require('./../utils/appError');
const factory = require('./handlerFactory');
const mongoose = require('mongoose');
const Store = require('../models/storeModel');

// const multerStorage = multer.diskStorage({
//   destination: (req, file, cb) => {
//     cb(null, 'public/img/users');
//   },
//   filename: (req, file, cb) => {
//     const ext = file.mimetype.split('/')[1];
//     cb(null, `user-${req.user.id}-${Date.now()}.${ext}`);
//   }
// });
const multerStorage = multer.memoryStorage();

const multerFilter = (req, file, cb) => {
  if (file.mimetype.startsWith('image')) {
    cb(null, true);
  } else {
    cb(new AppError('Not an image! Please upload only images.', 400), false);
  }
};

const upload = multer({
  storage: multerStorage,
  fileFilter: multerFilter
});

exports.uploadUserPhoto = upload.single('photo');

exports.resizeUserPhoto = catchAsync(async (req, res, next) => {
  if (!req.file) return next();

  req.file.filename = `user-${req.user.id}-${Date.now()}.jpeg`;

  await sharp(req.file.buffer)
    .resize(500, 500)
    .toFormat('jpeg')
    .jpeg({ quality: 70, mozjpeg: true, progressive: true })
    .toFile(`public/img/users/${req.file.filename}`);

  next();
});

const filterObj = (obj, ...allowedFields) => {
  const newObj = {};
  Object.keys(obj).forEach(el => {
    if (allowedFields.includes(el)) newObj[el] = obj[el];
  });
  return newObj;
};

exports.getMe = (req, res, next) => {
  
  req.params.id = req.user.id;
  next();
};

exports.updateMe = catchAsync(async (req, res, next) => {
  // 1) Create error if user POSTs password data
  if (req.body.password || req.body.passwordConfirm) {
    return next(
      new AppError(
        'This route is not for password updates. Please use /updateMyPassword.',
        400
      )
    );
  }

  // 2) Filtered out unwanted fields names that are not allowed to be updated
  const filteredBody = filterObj(req.body, 'name', 'email');
  if (req.file) filteredBody.photo = req.file.filename;

  // 3) Update user document
  const updatedUser = await User.findByIdAndUpdate(req.user.id, filteredBody, {
    new: true,
    runValidators: true
  });

  res.status(200).json({
    status: 'success',
    data: {
      user: updatedUser
    }
  });
});

exports.deleteMe = catchAsync(async (req, res, next) => {
  await User.findByIdAndUpdate(req.user.id, { active: false });

  res.status(204).json({
    status: 'success',
    data: null
  });
});

exports.createUser = (req, res) => {
  res.status(500).json({
    status: 'error',
    message: 'This route is not defined! Please use /signup instead'
  });
};

exports.getUser = factory.getOne(User,"store");
exports.getAllUsers = factory.getAll(User);

// Do NOT update passwords with this!
exports.updateUser = factory.updateOne(User);
exports.deleteUser = factory.deleteOne(User);



exports.getUsersByStores = catchAsync(async (req, res, next) => {
  let { storeIds } = req.body;

  // ===================================
  // ✅ VALIDATION
  // ===================================
  if (!storeIds || !Array.isArray(storeIds) || storeIds.length === 0) {
    return res.status(400).json({
      success: false,
      message: "storeIds must be a non-empty array",
    });
  }

  // ===================================
  // ✅ CONVERT TO OBJECT IDS
  // ===================================
  const objectStoreIds = storeIds
    .filter(id => mongoose.Types.ObjectId.isValid(id))
    .map(id => new mongoose.Types.ObjectId(id));

  if (objectStoreIds.length === 0) {
    return res.status(400).json({
      success: false,
      message: "No valid storeIds provided",
    });
  }

  // ===================================
  // ✅ FETCH USERS (MULTIPLE USERS PER STORE)
  // ===================================
  let users = await User.find({
    store: { $in: objectStoreIds },
     status: "active" // ✅ ONLY ACTIVE USERS
  })
    .select("name email role store")
    .lean();

  // ===================================
  // ✅ REMOVE DUPLICATES (IMPORTANT 🔥)
  // ===================================
  const uniqueUsersMap = {};
  users.forEach(user => {
    uniqueUsersMap[user._id.toString()] = user;
  });

  const uniqueUsers = Object.values(uniqueUsersMap);

  // ===================================
  // ✅ RESPONSE
  // ===================================
  res.status(200).json({
    success: true,
    results: uniqueUsers.length,
    data: uniqueUsers,
  });
});

// driver
exports.getDriversByStore = catchAsync(async (req, res, next) => {
  try {
    const { storeId } = req.params; // Extract store ID from request params

    if (!storeId) {
      return res.status(400).json({
        success: false,
        message: 'Store ID is required.',
      });
    }

    // Find all users assigned to the specified store with the role of 'driver'
    const drivers = await User.find({
      store: storeId,
      role: 'MachineOperator',
    }).select('-password -passwordConfirm -__v'); // Exclude sensitive fields like password

    if (!drivers || drivers.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'No drivers found for the specified store.',
      });
    }

    // Respond with the list of drivers
    res.status(200).json({
      success: true,
      message: 'Drivers retrieved successfully.',
      data: drivers,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});
