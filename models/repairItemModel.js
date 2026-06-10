const mongoose = require('mongoose');

const repairItemSchema = new mongoose.Schema(
  {
    masterlist: {
      type: mongoose.Schema.ObjectId,
      ref: 'MasterList',
      required: [true, 'Master item is required!']
    },

    // ✅ INVENTORY ADDED PROPERLY
    inventory: {
      type: mongoose.Schema.ObjectId,
      ref: 'Inventory',
      required: [true, 'Inventory item is required!']
    },

    repairOrder: {
      type: mongoose.Schema.ObjectId,
      ref: 'RepairRequest',
      required: [true, 'Repair Request reference is required!']
    },

    user: {
      type: mongoose.Schema.ObjectId,
      ref: 'User',
      required: [true, 'Repair Item must have a user!']
    },

    approvedByAdmin: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },

    adminApprovedAt: {
      type: Date,
    },

    approvedBySuperAdmin: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },

    superAdminApprovedAt: {
      type: Date,
    },


    repairMrv: {
      type: mongoose.Schema.ObjectId,
      ref: 'RepairMrv',
    },


    store: {
      type: mongoose.Schema.ObjectId,
      ref: 'Store',
      required: [true, 'Store is required!']
    },

    qtyRequired: {
      type: Number,
      required: [true, 'Repair Qty is required!'],
      min: [1, 'Qty must be at least 1']
    },

    status: {
      type: String,
      default: 'open',
      enum: {
        values: ['open', 'pending', 'approvedByAdmin', 'approved', 'recived', 'rejected', 'autoclosed', 'forceclosed', 'transfer request', 'local'],
        message: 'Status is either: pending, approved, recived or rejected'
      }
    },

    approveQty: Number,
    qtyRecived: {
      type: Number,
      default: 0
    },

    adminRemark: String,
    storeRemark: String,
    damageQty: Number,

    po: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'RepairPurchaseOrder'
    },

    poStatus: {
      type: String,
      default: 'pending',
      enum: ['pending', 'generated', 'pendingForApproval']
    },
    flag: {
      type: String,
      default: "new",
      enum: ['new', 'remain']
    },

    active: {
      type: Boolean,
      default: true,
      select: true
    }
  },
  { timestamps: true }
);

repairItemSchema.index({ repairOrder: 1, poStatus: 1, status: 1 });

// Auto populate
repairItemSchema.pre(/^find/, function (next) {
    // ✅ CHECK FLAG HERE
  if (this.getOptions().skipPopulate) {
    return next();
  }
  this.populate({
    path: 'masterlist',
    select: 'masterItem currentStock qtyAuth partNo description unit'
  })
    .populate({
      path: 'repairOrder',
      select: 'repairOrderNo store status createdAt'
    })
    .populate({
      path: 'user',
      select: 'name email'
    })
    .populate({
      path: 'store',
      select: 'name location storeCode'
    }).populate({
      path: 'po',
      select: 'poNumber createdAt', // <--- select ONLY poNumber
    }).populate({
    path: 'repairMrv',
    select: 'repairMrvNo image status createdAt'
  }).populate({
    path: 'approvedByAdmin',
    select: 'name email'
  })

  .populate({
    path: 'approvedBySuperAdmin',
    select: 'name email'
  });




  next();
});

module.exports = mongoose.model('RepairItem', repairItemSchema);
