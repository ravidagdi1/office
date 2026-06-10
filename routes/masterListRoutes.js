const express = require('express');
const authController = require('./../controllers/authController');
const masterListController = require('./../controllers/masterListController')
const router = express.Router();

router
  .route('/category/:categoryId')
  .get(authController.protect, masterListController.getItemsByCategory);

router
.route('/getDirectiveReoprt')
.get(authController.protect,masterListController.getDirectiveReport)

router
.route('/getMasterListByCategory')
.get(authController.protect,masterListController.getMasterListByCategory)

router
.route('/getIndigoReport')
.get(authController.protect,masterListController.getIndigoStock)

router
  .route('/')
  .get(authController.protect,masterListController.getAllList)
  .post(
    authController.protect,authController.restrictTo('superAdmin'),
    masterListController.uploadProductPhoto,
    masterListController.resizeProductPhoto,
    masterListController.createListItem
   );

router
   .route('/import-excel')
   .post(authController.protect,authController.restrictTo('superAdmin'),masterListController.uploadFile,masterListController.importExcel)

router
  .route('/:id')
  .get(authController.protect,masterListController.getListItem)
  .put(authController.protect,authController.restrictTo('superAdmin'),masterListController.uploadProductPhoto,masterListController.resizeProductPhoto,masterListController.updateListeItem)
  .delete(authController.protect,authController.restrictTo('superAdmin'),masterListController.deleteListeItem);


  
module.exports = router ;