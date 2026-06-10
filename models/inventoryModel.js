

const mongoose = require('mongoose');

const inventorySchema = new mongoose.Schema({
  masterItem:{
    type:mongoose.Schema.ObjectId,
    ref:'MasterList',
    required:[true,'Please Select Item !']
    
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
  qtyAuth:{
    type:Number
  },
  criticalStockQty:{
    type:Number
  },
  reqestedQty:{
    type:Number
  },
  reciveQty:{
    type:Number,
    default:0,

  },
  repairQty:{
    type:Number,
    default:0,

  },
  damage:{
    type:Number,
    default:0,
  },
   transitionQty:{
    type:Number,
    default:0,
  },

  totalRecive:{
    type:Number,
    default: 0,
    required:true
  },
  transfer:{
    type:Number,
    default: 0,
  },
  currentStock:{
    type:Number,
    default: 0,
  },
  totalMiv:{
    type:Number,
    default: 0,
  },
  lp:{
    type:Number,
    default:0
  },
  urgentRequirement:{
    type:Boolean,
    default:false
  },
  status:{
    type: String,
      default:'pending',
      enum: {
        values: ['pending', 'confirm', 'delivered'],
        message: 'Status is either: pending, confirm, delivered'
      }
  },
  remark:{
    type:String,
  },
  
  critical:{
    type: Boolean,
    default: false,
  },
  active: {
    type: Boolean,
    default: false,
    select: true
  }
}
);

// ✅ INDEXES (SAFE + FAST)
inventorySchema.index({ store: 1, masterItem: 1 }, { unique: true });
inventorySchema.index({ _id: 1, currentStock: 1 });
// userSchema.pre(/^find/, function(next) {
//   // this points to the current query
//   this.find({ active: { $ne: false } });
//   next();
// });

inventorySchema.pre(/^find/, function(next) {
   if (this.getOptions().skipPopulate) return next();
  this.populate({
    path: 'masterItem',
    select: '-__v -active -id'
  }).populate({
    path:'store',
    select: '-__v '
  }).populate({
    path: 'user',
    select: '-__v -active -id -password' 
  })

  next();
});

inventorySchema.pre('save', async function (next) {
  // Only run this check if the document is new (i.e., not yet saved)
  if (this.isNew) {
    const existingInventory = await Inventory.findOne({
      store: this.store,
      masterItem: this.masterItem,
    });

    if (existingInventory) {
      const error = new Error('One store can add one master list only once');
      error.status = 400;
      return next(error);
    }
  }

  // If not new (i.e., it's an update), skip the uniqueness check
  next();
});


// inventorySchema.path('store').validate(async function(value) {
//   const existingInventory = await Inventory.findOne({
//     store: value,
//     masterItem: this.masterItem,
//   });

//   if (existingInventory) {
//     this.invalidate('store', 'One store can add one master list only once');
//   }
// }, 'One store can add one master list only once');

const Inventory = mongoose.model('Inventory', inventorySchema);

module.exports = Inventory;
