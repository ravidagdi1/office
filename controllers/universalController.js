const factory = require('./handlerFactory');
const catchAsync = require('../utils/catchAsync');
const User = require('../models/userModel');
const masterlist = require('../models/masterListModel');
const inventorylist = require('../models/inventoryModel');
const itemList = require('../models/itemModel');
const mivList = require('../models/usedItemModel');
const transferList = require('../models/transferItemModel');
const castingList = require('../models/castingSchema');
const Asset = require('../models/assetModel');
const Accessories = require('../models/accessoriesModel')
const Fabrication=require('../models/FabricationModel')




exports.universalSearchController = async (req, res) => {

  try {

    const { type, query } = req.body;

    // =====================================================
    // VALIDATION
    // =====================================================

    if (!type || !query) {

      return res.status(400).json({
        success: false,
        message: "Search type and query are required",
      });
    }

    let masterResults = [];
    let inventoryResults = [];
    let assetResults = [];
    let itemResults = [];
    let mivResults = [];
    let transferResults = [];
    let castingResults = [];
    let fabricationResults = [];

    // =====================================================
    // MASTER FILTER
    // =====================================================

    let masterFilter = {};

    if (type === "partNo") {

      if (isNaN(query)) {

        return res.status(400).json({
          success: false,
          message: "Part No. must be numeric",
        });
      }

      masterFilter = {
        partNo: Number(query),
      };

    } else if (type === "description") {

      masterFilter = {
        description: {
          $regex: query.trim(),
          $options: "i",
        },
      };

    } else {

      return res.status(400).json({
        success: false,
        message: "Invalid search type",
      });
    }

    // =====================================================
    // MASTER LIST
    // =====================================================

    masterResults = await masterlist
      .find(masterFilter)
      .setOptions({ skipPopulate: true })
      .populate([
        {
          path: "category",
          select: "-__v -active -id",
        },
        {
          path: "unit",
          select: "-__v",
        },
        {
          path: "subCategory",
          select: "-__v",
        },
      ])
      .lean();

    const masterIds = masterResults.map((item) => item._id);

    // =====================================================
    // INVENTORY
    // =====================================================

    if (masterIds.length > 0) {

      inventoryResults = await inventorylist
        .find({
          masterItem: { $in: masterIds },
        })
        .setOptions({ skipPopulate: true })
        .populate([
          {
            path: "masterItem",
            select: "-__v -active -id",
            populate: [
              {
                path: "category",
                select: "-__v -active -id",
              },
              {
                path: "unit",
                select: "-__v",
              },
              {
                path: "subCategory",
                select: "-__v",
              },
            ],
          },
          {
            path: "store",
            select: "-__v",
          },
          {
            path: "user",
            select: "-__v -active -id -password",
          },
        ])
        .lean();

      const inventoryIds = inventoryResults.map((item) => item._id);

      // =====================================================
      // RELATED COLLECTIONS
      // =====================================================

      if (inventoryIds.length > 0) {

        [
          assetResults,
          itemResults,
          mivResults,
          transferResults,
          castingResults,
          fabricationResults,
        ] = await Promise.all([

          // =================================================
          // ASSET
          // =================================================

          Asset.find({
            inventory: { $in: inventoryIds },
          })
            .setOptions({ skipPopulate: true })
            .populate([
              {
                path: "inventory",
                select: "currentStock store masterItem",
                populate: [
                  {
                    path: "store",
                    select: "name location",
                  },
                  {
                    path: "masterItem",
                    select: "partNo description category unit subCategory",
                    populate: [
                      {
                        path: "category",
                        select: "name",
                      },
                      {
                        path: "unit",
                        select: "name",
                      },
                      {
                        path: "subCategory",
                        select: "name",
                      },
                    ],
                  },
                ],
              },
              {
                path: "masterItem",
                select: "partNo description category unit subCategory",
                populate: [
                  {
                    path: "category",
                    select: "name",
                  },
                  {
                    path: "unit",
                    select: "name",
                  },
                  {
                    path: "subCategory",
                    select: "name",
                  },
                ],
              },
              {
                path: "assignedTo",
                select: "name email role",
              },
              {
                path: "store",
                select: "name location",
              },
            ])
            .lean(),

          // =================================================
          // ITEM
          // =================================================

          itemList
            .find({
              inventory: { $in: inventoryIds },
            })
            .setOptions({ skipPopulate: true })
            .populate([
              {
                path: "inventory",
                select: "-__v -active -id",
                populate: {
                  path: "masterItem",
                  select: "partNo description category unit subCategory",
                  populate: [
                    {
                      path: "category",
                      select: "name",
                    },
                    {
                      path: "unit",
                      select: "name",
                    },
                    {
                      path: "subCategory",
                      select: "name",
                    },
                  ],
                },
              },
              {
                path: "requisitionNo",
                select: "-__v",
              },
              {
                path: "user",
                select: "-__v -active -id -password",
              },
              {
                path: "store",
                select: "name location storeCode",
              },
              {
                path: "mrv",
                select: "-__v -active -id",
              },
              {
                path: "po",
                select: "poNumber createdAt",
              },
              {
                path: "approvedByAdmin",
                select: "name email",
              },
              {
                path: "approvedBySuperAdmin",
                select: "name email",
              },
            ])
            .lean(),

          // =================================================
          // MIV
          // =================================================

          mivList
            .find({
              inventory: { $in: inventoryIds },
            })
            .setOptions({ skipPopulate: true })
            .populate([
              {
                path: "inventory",
                select: "-__v -active -id",
                populate: {
                  path: "masterItem",
                  select: "partNo description",
                },
              },
              {
                path: "miv",
                select: "-__v",
              },
              {
                path: "user",
                select: "name email",
              },
            ])
            .lean(),

          // =================================================
          // TRANSFER
          // =================================================

          transferList
            .find({
              inventory: { $in: inventoryIds },
            })
            .select("transferQty recived approveQty damageQty transferDate recivedBy status flag createdAt updatedAt inventory inventoryTo transfer user mrv approveBy assets")
            .setOptions({ skipPopulate: true })
            .populate([
              {
                path: "inventory",
                select: "-__v -active -id",
                populate: {
                  path: "masterItem",
                  select: "partNo description category unit",
                },
              },
              {
                path: "inventoryTo",
                select: "-__v -active -id",
              },
              {
                path: "transfer",
                select: "-__v",
                populate: [
                  {
                    path: "storeFrom",
                    select: "name",
                  },
                  {
                    path: "storeTo",
                    select: "name",
                  },
                ],
              },
              {
                path: "user",
                select: "-__v -active -id -password",
              },
              {
                path: "mrv",
                select: "-__v",
              },
              {
                path: "approveBy",
                select: "name email",
              },
              {
                path: "assets",
                select: "serialNumber model status",
              },
            ])
            .lean(),

          // =================================================
          // CASTING
          // =================================================

          castingList
            .find({
              inventory: { $in: inventoryIds },
            })
            .setOptions({ skipPopulate: true })
            .populate([
              {
                path: "inventory",
                select: "-__v -active -id",
                populate: {
                  path: "masterItem",
                  select: "partNo description",
                },
              },
              {
                path: "masterItem",
                select: "-__v",
                populate: [
                  {
                    path: "category",
                    select: "name",
                  },
                  {
                    path: "unit",
                    select: "name",
                  },
                ],
              },
              {
                path: "user",
                select: "-__v -active -id -password",
              },
            ])
            .lean(),
          // fabrication //
          Fabrication.find({
            $or: [
              { "sentItems.inventoryId": { $in: inventoryIds } },
              { "receivedItem.inventoryId": { $in: inventoryIds } },
            ],
          })
            .setOptions({ skipPopulate: true })
            .populate([
              {
                path: "storeId",
                select: "name",
              },
              {
                path: "sentItems.inventoryId",
                select: "-__v -active -id",
                populate: {
                  path: "masterItem",
                  select: "partNo description",
                },
              },
              {
                path: "receivedItem.inventoryId",
                select: "-__v -active -id",
                populate: {
                  path: "masterItem",
                  select: "partNo description",
                },
              },
            ])
            .lean(),
        ]);
      }
    }

    // =====================================================
    // RESPONSE
    // =====================================================

    return res.json({

      success: true,

      count:
        masterResults.length +
        inventoryResults.length +
        assetResults.length +
        itemResults.length +
        mivResults.length +
        transferResults.length +
        castingResults.length+
         fabricationResults.length,

      data: {
        masterResults,
        inventoryResults,
        assetResults,
        itemResults,
        mivResults,
        transferResults,
        castingResults,
          fabricationResults,
        
      },
    });

  } catch (err) {

    console.error("Universal Search Error:", err);

    return res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
};











