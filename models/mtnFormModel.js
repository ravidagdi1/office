

const mongoose = require('mongoose');

const mtnFormSchema = new mongoose.Schema({
  mrvNo:{
    type:Number,
    unique:true,

    required:[true,'A request must have a requisition no']
 },
  image:{
    type:String,
    // required : [true, "A request must contain a doc Image !"]
  },
  store:{
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

mtnFormSchema.pre(/^find/, function(next) {
  if (this.getOptions().skipPopulate) return next();
  this.populate({
    path:'store',
    select: '-__v '
  }).populate({
    path: 'user',
    select: '-__v -active -id -password' 
  });

  next();
});



const Mtn = mongoose.model('Mtn', mtnFormSchema);

module.exports = Mtn;
