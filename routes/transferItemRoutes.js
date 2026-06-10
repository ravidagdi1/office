const express = require('express');
const authController = require('../controllers/authController');
const trasnferItemController = require('../controllers/trasnferItemController')
const router = express.Router();


router
  .route('/')
  .get(authController.protect,authController.restrictTo('admin','storeKeeper'),trasnferItemController.getAllItem)
  .post( authController.protect,authController.restrictTo('admin','storeKeeper'), trasnferItemController.createItem);

router
   .route('/to')
   .get(authController.protect,trasnferItemController.getAllRecivedItem)

router
  .route('/:id')
  .get(trasnferItemController.getInventoryItem)
  .patch(authController.protect,trasnferItemController.updateRequestItem)
  .delete(trasnferItemController.deleteInventroyItem);

  router
  .route('/report')
  .post( authController.protect,authController.restrictTo('superAdmin'), trasnferItemController.getItemsByStoreStatusDate);

  router
  .route('/report/download')
  .post( authController.protect,authController.restrictTo('superAdmin'), trasnferItemController.downloadTransferReport);


module.exports = router ;