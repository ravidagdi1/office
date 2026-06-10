const express = require('express');
const authController = require('../controllers/authController');
const inventoryController = require('../controllers/inventoryController')
const router = express.Router();


router
  .route('/')
  .get(authController.protect,inventoryController.getAllInventory)
  .post( authController.protect, inventoryController.createInventoryItem);

router
  .route('/desiel/inventory')
  .get(authController.protect,inventoryController.getDesilInventory)

  router
  .route('/masterItem')
  .get(authController.protect,inventoryController.getInventoryByMasterItem)

router
  .route('/:id')
  .get(authController.protect,inventoryController.getInventoryItem)
  .put(authController.protect,authController.restrictTo('admin','superAdmin','storeKeeper'),inventoryController.updateInvetoryItem)
  .delete(authController.protect,authController.restrictTo('admin','superAdmin'), inventoryController.deleteInventroyItem);


module.exports = router ;