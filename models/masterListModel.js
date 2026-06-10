const crypto = require('crypto');
const mongoose = require('mongoose');
const validator = require('validator');
const bcrypt = require('bcryptjs');

const masterListSchema = new mongoose.Schema({
  partNo: {
    type: Number,
    required: [true, 'Please tell us your name!'],
    unique: true
  },
  image: {
    type: String,
  },
  category:{
    type: mongoose.Schema.ObjectId,
    ref: 'Category',
    required: [true, 'Category is required']
  },
  subCategory: {
    type: mongoose.Schema.ObjectId,
    ref: 'Subcategory', // ✅ Reference to Subcategory collection
    //required: [true, 'Subcategory is required']
  },
  description:{
    type:String
  },
  unit:{
    type:mongoose.Schema.ObjectId,
    ref: 'Unit',
    required: [true, 'Unit is required']
  },
  remark:{
    type:String
  },
  active: {
    type: Boolean,
    default: false,
    select: true
  },
  rate:{
    type:Number,
    default:0
  },
});

masterListSchema.pre(/^find/, function(next) {
  if (this.getOptions().skipPopulate) return next();
  this.populate({
    path: 'category',
    select: '-__v -active -id'
  }).populate({
    path:'unit',
    select: '-__v '
  }).populate({
    path:'subCategory',
    select: '-__v '
  })

  next();
});
// userSchema.pre(/^find/, function(next) {
//   // this points to the current query
//   this.find({ active: { $ne: false } });
//   next();
// });


const MasterList = mongoose.model('MasterList', masterListSchema);

module.exports = MasterList;
