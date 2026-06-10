const express = require('express');
const authController = require('../controllers/authController');
const subCategoryController = require('../controllers/subCategoryController')
const router = express.Router();


router
  .route('/')
  .get(authController.protect,subCategoryController.getAllCategory)
  .post(authController.protect,authController.restrictTo('superAdmin'),subCategoryController.createCategory);

router
  .route('/:id')
  .get(authController.protect,authController.restrictTo("superAdmin"),subCategoryController.getCategoryById)
  .put(authController.protect,authController.restrictTo("superAdmin"),subCategoryController.updateCategoryById)
  .delete(authController.protect,authController.restrictTo("superAdmin"),subCategoryController.deleteCategoryById);

module.exports = router ;