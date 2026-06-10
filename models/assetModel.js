const mongoose = require('mongoose');

const assetSchema = new mongoose.Schema(
  {
    // 🔗 Link to Inventory
    inventory: {
      type: mongoose.Schema.ObjectId,
      ref: 'Inventory',
      required: [true, 'Inventory reference is required'],
      index: true,
    },

    // 🔗 Direct reference to MasterList
    masterItem: {
      type: mongoose.Schema.ObjectId,
      ref: 'MasterList',
      required: [true, 'Master item reference is required'],
      index: true,
    },

    // 🏬 Direct reference to Store (auto-filled from Inventory)
    store: {
      type: mongoose.Schema.ObjectId,
      ref: 'Store',
      required: [true, 'Store reference is required'],
      index: true,
    },

    // 🏷 Vendor or supplier info
    vendor: {
      type: String,
      required: [true, 'Vendor name or number is required'],
      trim: true,
    },

    // 🔢 Unique Serial Number
    serialNumber: {
      type: String,
      required: [true, 'Serial number is required'],
      unique: true,
      trim: true,
    },

    // ⚙️ Model or variant
    model: {
      type: String,
      trim: true,
    },

    // 👤 Assigned user (if any)
    assignedTo: {
      type: mongoose.Schema.ObjectId,
      ref: 'User',
    },

    // 📅 Purchase & warranty info
    purchaseDate: Date,
    warrantyExpiry: Date,

    // ⚙️ Equipment details
    equipmentNo: {
      type: String,
      trim: true,
    },
    purchasedAmount: {
      type: Number,
      default: 0,
    },
    invoiceNo: {
      type: String,
      trim: true,
    },

    // 🔧 Condition & status
    condition: {
      type: String,
      enum: ['Excellent', 'Good', 'Fair', 'Damaged'],
      default: 'Good',
    },
    status: {
      type: String,
      enum: ['Available', 'In Use', 'Repair', 'Scrapped', 'Transition'],
      default: 'Available',
    },

    // 📝 Optional notes
    remarks: {
      type: String,
      trim: true,
    },

    // 🔘 Active / Inactive flag
    active: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  }
);

//
// ✅ Auto-populate references when fetching Asset
//
assetSchema.pre(/^find/, function (next) {
   if (this.getOptions().skipPopulate) return next();
  this.populate({
    path: 'inventory',
    select: 'currentStock store',
    populate: { path: 'store', select: 'name location' },
  })
    .populate({
      path: 'masterItem',
      select: 'partNo description category unit',
      populate: [
        { path: 'category', select: 'name' },
        { path: 'unit', select: 'name' },
      ],
    })
    .populate({
      path: 'assignedTo',
      select: 'name email role',
    })
    .populate({
      path: 'store',
      select: 'name location',
    });
  next();
});

const Asset = mongoose.model('Asset', assetSchema);
module.exports = Asset;
