const express = require('express');
const router = express.Router();
const authController=require('../controllers/authController');
const supplierRateController = require('../controllers/supplierRateController')


router
  .route('/')
  .get(authController.protect,authController.restrictTo('superAdmin'),supplierRateController.getAllSupplierRatesByStatus)




module.exports = router;
