const express = require('express');
const authController = require('../controllers/authController');
const usedItemController = require('../controllers/usedItemController')
const router = express.Router();


router
  .route('/')
  .get(authController.protect,authController.restrictTo('admin','storeKeeper'),usedItemController.getAllItem)
  .post( authController.protect,authController.restrictTo('admin','storeKeeper'), usedItemController.createItem);

router
  .route('/:id')
  .get(usedItemController.getInventoryItem)
  .patch(authController.protect,authController.restrictTo('admin'),usedItemController.updateRequestItem)
  .delete(usedItemController.deleteInventroyItem);

  router
  .route('/miv/:miv')
  .get(authController.protect,authController.restrictTo('superAdmin','admin','storeKeeper'),usedItemController.getUsedItemByMiv)


  router
  .route('/report')
  .post( authController.protect,authController.restrictTo('superAdmin'), usedItemController.getItemsByStoreStatusDate);
  
  router
  .route('/itemreport')
  .post( authController.protect,authController.restrictTo('superAdmin'), usedItemController.getGrpopItemsByStoreStatusDate);

router
  .route('/report/download')
  .post( authController.protect,authController.restrictTo('superAdmin'), usedItemController.downloadMIVReport);

module.exports = router ;