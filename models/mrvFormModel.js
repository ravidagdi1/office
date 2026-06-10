

const mongoose = require('mongoose');

const mrvFormSchema = new mongoose.Schema({
  mrvNo: {
    type: Number,
    unique: true,

    required: [true, 'A request must have a requisition no']
  },
  image: {
    type: String,
    // required : [true, "A request must contain a doc Image !"]
  },
  store: {
    type: mongoose.Schema.ObjectId,
    ref: 'Store',
    required: [true, 'Please Select Store !']
  },

  user: {
    type: mongoose.Schema.ObjectId,
    ref: 'User',
    required: [true, 'Please Select User !']
  },
  // ✅ New Supplier Reference
  supplier: {
    type: mongoose.Schema.ObjectId,
    ref: 'SuppliersDetails',
    required: [true, 'Please Select Supplier !']
  },

  status: {
    type: String,
    default: 'open',
    enum: {
      values: ['open', 'submit', 'close','forceClosed'],
      message: 'Status is either: open, submit or close'
    }
  },
  billingNo: {
    type: Number,
    unique: true,
  },
  billingTitle: {
     type: String,
  },
  billingDate: {
    type: Date

  },
totalAmount: {
  type: Number,
  default: 0
}
,
  otherCharges: {
    type: Number,
    default: 0
  },
  itemCount: {
    type: Number,
    required: [true, "Please enter item count"],
    min: [1, "Item count must be at least 1"]
  },


  active: {
    type: Boolean,
    default: true,
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

mrvFormSchema.pre(/^find/, function (next) {
  if (this.getOptions().skipPopulate) return next(); // ✅ ADD THIS
  this.populate({
    path: 'store',
    select: '-__v '
  }).populate({
    path: 'user',
    select: '-__v -active -id -password'
  }).populate({
    path: 'supplier',
    select: 'name city state _id'
  });


  next();
});



const Mrv = mongoose.model('Mrv', mrvFormSchema);

module.exports = Mrv;
