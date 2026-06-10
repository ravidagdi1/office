

const mongoose = require('mongoose');

const transferItemSchema = new mongoose.Schema({
  inventory: {
    type: mongoose.Schema.ObjectId,
    ref: 'Inventory',
    required: [true, 'Please Select Item !']
  },
  inventoryTo: {
    type: mongoose.Schema.ObjectId,
    ref: 'Inventory'
  },
  transfer: {
    type: mongoose.Schema.ObjectId,
    ref: 'Transfer',
    required: [true, 'A item must have a transfer no']
  },
  mrv: {
    type: mongoose.Schema.ObjectId,
    ref: 'Mtn',
  },
  user: {
    type: mongoose.Schema.ObjectId,
    ref: 'User',
    required: [true, 'A item must have a user']
  },
  to: {
    type: mongoose.Schema.ObjectId
  },
  from: {
    type: mongoose.Schema.ObjectId
  },
  transferQty: {
    type: Number
  },
  recived: {
    type: Number
  },
  damageQty: {
    type: Number
  },
  approveQty: {
    type: Number
  },
  approveBy: {
    type: mongoose.Schema.ObjectId,
    ref: 'User'
  },
  transferDate: {
    type: String
  },
  recivedBy: {
    type: String
  },
  // ✅ Multiple assets allowed now
  assets: [
    {
      type: mongoose.Schema.ObjectId,
      ref: 'Asset',
    },
  ],
  flag: {
    type: String,
    enum: ['new', 'remain'],
    default: 'new'
  },
  status: {
    type: String,
    default: 'open',
    enum: {
      values: ['open', 'pending', 'approved', 'rejected', 'recived', 'autoclosed', 'forceclosed'],
      message: 'Status is either: pending, approved or rejected'
    }
  },
  active: {
    type: Boolean,
    default: false,
    select: true
  }
}
  , {
    timestamps: true,
  });

// userSchema.pre(/^find/, function(next) {
//   // this points to the current query
//   this.find({ active: { $ne: false } });
//   next();
// });

transferItemSchema.pre(/^find/, function (next) {
  if (this.getOptions().skipPopulate) return next();
  this.populate({
    path: 'inventory',
    select: '-__v -active -id'
  }).populate({
    path: 'transfer',
    select: '-__v '
  }).populate({
    path: 'user',
    select: '-__v -active -id -password'
  }).populate({
    path: 'mrv',
    select: '-__v '
  })
    // ✅ NEW: populate assets for dropdown display
    .populate({
      path: 'assets',
      select: 'serialNumber model status'
    });

  next();
});



const transferItem = mongoose.model('transferItem', transferItemSchema);

module.exports = transferItem;
