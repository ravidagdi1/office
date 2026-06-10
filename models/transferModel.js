

const mongoose = require('mongoose');

const transferModel = new mongoose.Schema({
  transferNo:{
    type:Number,
    unique:[true,'Requisition  No already exists'],

    required:[true,'A request must have a requisition no']
 },
  image:{
    type:String,
    // required : [true, "A request must contain a doc Image !"]
  },
  storeFrom:{
    type:mongoose.Schema.ObjectId,
    ref:'Store',
    required:[true,'Please Select Store !']
  },
  storeTo:{
    type:mongoose.Schema.ObjectId,
    ref:'Store',
    required:[true,'Please Select Store !']
  },
  user:{
     type:mongoose.Schema.ObjectId,
     ref:'User',
     required:[true,'Please Select User !']
  },
  
  status:{
    type: String,
      default:'open',
      enum: {
        values: ['open', 'submit', 'close',],
        message: 'Status is either: open, submit or close'
      }
  },
  active: {
    type: Boolean,
    default: true,
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

transferModel.pre(/^find/, function(next) {
   if (this.getOptions().skipPopulate) return next();
  this.populate({
    path:'storeFrom',
    select: '-__v '
  }).populate({
    path: 'user',
    select: '-__v -active -id -password' 
  }).populate({
    path: 'storeTo',
    select: '-__v -active -id -password' 
  });

  next();
});



const Transfer = mongoose.model('Transfer', transferModel);

module.exports = Transfer;
