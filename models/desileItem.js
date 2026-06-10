

const mongoose = require('mongoose');
const { path } = require('../app');

const desileItem = new mongoose.Schema({
  inventory:{
    type:mongoose.Schema.ObjectId,
    ref:'Inventory',
    required:[true,'Please Select Item !']
  },
  requisitionNo:{
     type:Number,
     required:[true,'A item must have a requisition no']
  },
  user:{
    type:mongoose.Schema.ObjectId,
    ref:'User',
    required:[true,'A item must have a user']
  },
  vehicle: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Vehicle',
      required: false,
    },
  store:{
    type:mongoose.Schema.ObjectId,
    ref:'Store',
    required:[true,'A item must have a user']
  },
  mrv:{
    type:Number
  },
  qtyRequired:{
    type:Number
  },
  approveQty:{
    type:Number
  },
  indigoStock:{
    type:Number
  },
  approveBy:{
    type:mongoose.Schema.ObjectId,
    ref:'User'
  },
  adminRemark:{
    type:String
  },
  storeRemark:{
    type:String
  },
  qtyRecived:{
    type:Number
  },
  recivedDate:{
    type:String
  },
  recivedBy:{
    type:String
  },
  damageQty:{
    type:Number
  },
  flag:{
    type:String,
    default:"new",
    enum:['new','remain']
  },
  status:{
    type: String,
      default:'open',
      enum: {
        values: ['open','pending', 'approvedByAdmin','approved', 'recived','rejected'],
        message: 'Status is either: pending, approved, recived or rejected'
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


// userSchema.pre(/^find/, function(next) {
//   // this points to the current query
//   this.find({ active: { $ne: false } });
//   next();
// });

desileItem.pre(/^find/, function(next) {
  this.populate({
    path: 'inventory',
    select: '-__v -active -id'
  }).populate({
    path:'requisitionNo',
    select: '-__v '
  }).populate({
    path: 'user',
    select: '-__v -active -id -password' 
  }).populate({
    path: 'mrv',
    select: '-__v -active -id'
  }).populate({
    path: 'vehicle',
    select: '-__v -active -id'
  });

  next();
});



const DesileItem = mongoose.model('DesileItem', desileItem);

module.exports = DesileItem;
