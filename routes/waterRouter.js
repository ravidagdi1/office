const express = require('express');
const authController = require('../controllers/authController');
const waterController = require('../controllers/waterController');

const router = express.Router();

// Route to get all MRVs for a store (existing)
router
  .route('/mrv/:storeId')
  .get(
    authController.protect,
    authController.restrictTo('superAdmin', 'storeKeeper'),
    waterController.getAllMRV
  );

// ✅ New Route to get items for a specific MRV in a store
router
  .route('/mrv/:storeId/:mrvId')
  .get(
    authController.protect,
    authController.restrictTo('superAdmin', 'storeKeeper'),
    waterController.getItemsForMRV
  );

module.exports = router;
