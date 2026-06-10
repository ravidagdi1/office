

const mongoose = require('mongoose');
const { path } = require('../app');

const usedItemSchema = new mongoose.Schema({
  inventory:{
    type:mongoose.Schema.ObjectId,
    ref:'Inventory',
    required:[true,'Please Select Item !']
  },
  miv:{
     type:mongoose.Schema.ObjectId,
     ref:'Miv',
     required:[true,'A item must have a usedItem no']
  },
  user:{
    type:mongoose.Schema.ObjectId,
    ref:'User',
    required:[true,'A item must have a user']
  },
  adminRemark:{
    type:String
  },
  usedQty:{
    type:Number
  },
  approveBy:{
    type:mongoose.Schema.ObjectId,
    ref:'User'
  },
  approveQty:{
    type:Number,
    default:0
  },
  usedDate:{
    type:String
  },
  usedBy:{
    type:String
  },
  remark: {
    type: String
  },
  status:{
    type: String,
      default:'open',
      enum: {
        values: ['open','pending', 'approved', 'rejected','autoclosed','forceclosed'],
        message: 'Status is either: pending, approved or rejected'
      }
  },
  
  active: {
    type: Boolean,
    default: false,
    select: true
  }
}
,{
  timestamps:true,
});

usedItemSchema.index({ status: 1, createdAt: 1 });


// userSchema.pre(/^find/, function(next) {
//   // this points to the current query
//   this.find({ active: { $ne: false } });
//   next();
// });

usedItemSchema.pre(/^find/, function(next) {

  // ✅ SKIP AUTO POPULATE IF FLAG IS SET
  if (this.getOptions().skipPopulate) {
    return next();
  }
  this.populate({
    path: 'inventory',
    select: '-__v -active -id'
  }).populate({
    path:'miv',
    select: '-__v '
  }).populate({
    path: 'user',
    select: '-__v -active -id -password' 
  })

  next();
});



const usedItem = mongoose.model('usedItem', usedItemSchema);

module.exports = usedItem;
