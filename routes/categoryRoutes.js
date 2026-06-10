const express = require('express');
const authController = require('../controllers/authController');
const categoryController = require('../controllers/categoryController')
const router = express.Router();


router
  .route('/')
  .get(authController.protect,categoryController.getAllCategory)
  .post(authController.protect,authController.restrictTo('superAdmin'),categoryController.createCategory);

router
  .route('/:id')
  .get(authController.protect,authController.restrictTo("superAdmin"),categoryController.getCategoryById)
  .put(authController.protect,authController.restrictTo("superAdmin"),categoryController.updateCategoryById)
  .delete(authController.protect,authController.restrictTo("superAdmin"),categoryController.deleteCategoryById);

module.exports = router ;