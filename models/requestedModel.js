

const mongoose = require('mongoose');

const requestedSchema = new mongoose.Schema({
  requisitionNo: {
    type: Number,
    unique: [true, 'Requisition  No already exists'],

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

  status: {
    type: String,
    default: 'open',
    enum: {
      values: ['open', 'submit', 'adminSubmit', 'close', 'PO Pending', 'cancelled', 'pendingWithBoss'],
      message: 'Invalid status value'
    }
  },
  directorRemark: {
    type: String,
    trim: true,
    default: ""
  },
  revisionType: {
    type: String,
    enum: ['new', 'revised','priority'],
    default: 'new'
  },
  returnedByDirectorAt: {
    type: Date
  },
  returnedByDirector: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  superAdminRemark: {
    type: String,
    trim: true,
    default: ""
  },

  sentBySuperAdmin: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },

  sentBySuperAdminAt: {
    type: Date
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

requestedSchema.pre(/^find/, function (next) {
  if (this.getOptions().skipPopulate) return next(); // ✅ ADD THIS
  this.populate({
    path: 'store',
    select: '-__v '
  }).populate({
    path: 'user',
    select: '-__v -active -id -password'
  })
    .populate({
      path: 'returnedByDirector',
      select: 'name email role'
    })
    .populate({
      path: 'sentBySuperAdmin',
      select: 'name email role'
    });

  next();
});



const Request = mongoose.model('Request', requestedSchema);

module.exports = Request;
