const express = require('express');
const authController = require('../controllers/authController');
const RepairItemController = require('../controllers/repairItemController')
const router = express.Router();


router
  .route('/')
  .get(authController.protect,authController.restrictTo('admin','storeKeeper','superAdmin'),RepairItemController.getAllItem)


    router
    .route('/:id')
    .patch(authController.protect,authController.restrictTo('admin','superAdmin'),RepairItemController.updateRequestItem)


  module.exports=router;
