const express = require('express');
const router = express.Router();

const assetController = require('../controllers/assetController');

router
 
// ✅ Fetch assets by inventoryId (this must come BEFORE :id route)
router
  .route('/inventory/:inventoryId')
  .get(assetController.getAssetsByInventory);

// ✅ Get all assets / create asset
router
  .route('/')
  .get(assetController.getAllAssets)
  .post(assetController.createAsset);

  router.
  get('/by-store', assetController.getAssetsByStore);


  router
  .route('/available-assets')
  .get(assetController.getAvailableAssets);



module.exports = router;
