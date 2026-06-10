const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const billingController= require('../controllers/billingController');

// Router to create new supppliers
router
  .route('/:state')
  .get(
    authController.protect,
    authController.restrictTo('superAdmin','pomaker','pochecker','billing','accounts','director'),
    billingController.allBillingAddressState
  )

module.exports = router;