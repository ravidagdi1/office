const express = require('express');
const authController = require('../controllers/authController');
const VechileCategoryController = require('../controllers/vechilecatController')
const router = express.Router();


router
  .route('/')
  .get(authController.protect,VechileCategoryController.getAllCategory)
  .post(authController.protect,authController.restrictTo('superAdmin'),VechileCategoryController.createCategory);

router
  .route('/:id')
  .get(authController.protect,authController.restrictTo("superAdmin"),VechileCategoryController.getCategoryById)
  .put(authController.protect,authController.restrictTo("superAdmin"),VechileCategoryController.updateCategoryById)
  .delete(authController.protect,authController.restrictTo("superAdmin"),VechileCategoryController.deleteCategoryById);

module.exports = router ;