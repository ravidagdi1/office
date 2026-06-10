const express = require('express');
const authController = require('../controllers/authController');
const mrvController = require('../controllers/mtnController')
const router = express.Router();


router
  .route('/')
  .get(authController.protect,authController.restrictTo('admin','storeKeeper','superAdmin'),mrvController.getAllMrv)
  .post( authController.protect,authController.restrictTo('admin','storeKeeper'),mrvController.uploadProductPhoto,mrvController.resizeProductPhoto, mrvController.createMrv);


router
.route('/submitTransferMrv')
.post(authController.protect,authController.restrictTo('admin','storeKeeper'),mrvController.submitTransferMrv)


router
  .route('/:id')
  .get(mrvController.getSingleMrv)
  .patch(authController.protect,authController.restrictTo('admin','storeKeeper'),mrvController.updateRequestItem)
  .delete(authController.protect,mrvController.deleteInventroyItem);

module.exports = router ;