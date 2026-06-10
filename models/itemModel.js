const mongoose = require('mongoose');
const { path } = require('../app');

const itemSchema = new mongoose.Schema({
  inventory: {
    type: mongoose.Schema.ObjectId,
    ref: 'Inventory',
    required: [true, 'Please Select Item !']
  },
  requisitionNo: {
    type: mongoose.Schema.ObjectId,
    ref: 'Request',
    required: [true, 'A item must have a requisition no']
  },
  user: {
    type: mongoose.Schema.ObjectId,
    ref: 'User',
    required: [true, 'A item must have a user']
  },

  store: {
    type: mongoose.Schema.ObjectId,
    ref: 'Store',
    required: [true, 'A item must have a user']
  },
  mrv: {
    type: mongoose.Schema.ObjectId,
    ref: 'Mrv',
  },
  qtyRequired: {
    type: Number
  },
  approveQty: {
    type: Number
  },
  indigoStock: {
    type: Number
  },
  approveBy: {
    type: mongoose.Schema.ObjectId,
    ref: 'User'
  },
  adminRemark: {
    type: String
  },
  storeRemark: {
  type: String,
  trim: true,
  default: ""
},
poRemark: {
  type: String,
  trim: true,
  default: ""
},
  remark: {
    type: String,
    trim: true,
    default: "" // Optional field — no need to require it
  },
  qtyRecived: {
    type: Number
  },
  recivedDate: {
    type: String
  },
  recivedBy: {
    type: String
  },
  cancelQty: {
    type: Number,
    default: 0,
    min: [0, 'Cancelled qty cannot be negative']
  },

  cancelledBy: {
    type: mongoose.Schema.ObjectId,
    ref: 'User'
  },

  damageQty: {
    type: Number
  },
  flag: {
    type: String,
    default: "new",
    enum: ['new', 'remain']
  },
  status: {
    type: String,
    default: 'open',
    enum: {
      values: ['open', 'pending', 'approvedByAdmin', 'approved', 'recived', 'rejected', 'autoclosed', 'forceclosed', 'tranfer request', 'local', 'supplier_failed', 'approvedBySuperAdmin','AssignedToHo'],
      message: 'Status is either: pending, approved, recived or rejected'
    }
  },

  previousStatus: {
  type: String,
  default: null
},
  waterConsumedStatus: {
    type: String,
    default: 'notConsumed',
    enum: ['notConsumed', 'consumed'],
  },
  po: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'PurchaseOrder',
  },
  approvedByAdmin: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },

  adminApprovedAt: {
    type: Date
  },

  approvedBySuperAdmin: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },

  superAdminApprovedAt: {
    type: Date
  },

  approvedByBoss: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  bossApprovedAt: Date,



  active: {
    type: Boolean,
    default: false,
    select: true
  },
  poStatus: {
    type: String,
    default: 'pending',
    enum: ['pending', 'generated', 'pendingForApproval', 'waitingForBoss'],
  }
},
  {
    timestamps: true,
  });


// userSchema.pre(/^find/, function(next) {
//   // this points to the current query
//   this.find({ active: { $ne: false } });
//   next();
// });

itemSchema.pre(/^find/, function (next) {
   // ✅ Skip populate if explicitly disabled
  if (this.getOptions().skipPopulate) return next();
  this.populate({
    path: 'inventory',
    select: '-__v -active -id'
  }).populate({
    path: 'requisitionNo',
    select: '-__v '
  }).populate({
    path: 'user',
    select: '-__v -active -id -password'
  }).populate({
    path: 'store',
    select: 'name location storeCode'  // <-- added store
  })
    .populate({
      path: 'mrv',
      select: '-__v -active -id'
    }).populate({
      path: 'po',
      select: 'poNumber createdAt', // <--- select ONLY poNumber
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



const Item = mongoose.model('Item', itemSchema);

module.exports = Item;
