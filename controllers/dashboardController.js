const Request = require("../models/requestedModel")
const Transfer = require("../models/transferModel")
const Miv = require("../models/MivFormModel")
const Mrv = require("../models/itemModel");
const MrvTable = require("../models/mrvFormModel");
const Mtn = require("../models/transferItemModel")
const Mtntable = require('../models/mtnFormModel')
const store = require('../models/storeModel')
const users = require('../models/userModel')
const mongoose = require("mongoose");
const Inventory = require('../models/inventoryModel')
const MasterList = require('../models/masterListModel')
const units = require('../models/unitModel')
const PurchaseOrder = require('../models/PurchaseOrder')

const catchAsync = require("../utils/catchAsync");
const transferItem = require("../models/transferItemModel");
const Item = require("../models/itemModel");
const usedItem = require("../models/usedItemModel");
const RepairMrv = require('../models/repairMrvFormModel')
const repairitems = require('../models/repairItemModel')

exports.getAllCount = catchAsync(async (req, res, next) => {
  const user = req.user;

  const PENDING_STATUS = [
    "submit",
    "adminSubmit",
    "pendingWithBoss"
  ];

  // ✅ PO PENDING STATUS
  const PO_PENDING_STATUS = [
    "Assigned-To-Maker",
    "Assigned-To-Checker",
    "Assigned-To-SuperAdmin",
    "Generated"
  ];

  let storeFilter = {};

  // ===================================
  // ✅ SAME ACCESS FOR:
  // superAdmin, director,
  // pomaker, pochecker
  // ===================================
  const fullAccessRoles = [
    "superAdmin",
    "director",
    "pomaker",
    "pochecker",
     "accounts",
     "billing" // ✅ added
  ];

  if (!fullAccessRoles.includes(user.role)) {
    const ids = user.store.map(
      (item) => item._id
    );

    storeFilter = {
      store: { $in: ids }
    };
  }

  // ===================================
  // FINAL FILTERS
  // ===================================
  const filter = {
    status: { $in: PENDING_STATUS },
    ...storeFilter
  };

  const filter2 = {
    status: "approved",
    ...storeFilter
  };

  const filter3 = {
    status: "close",
    ...storeFilter
  };

  const filter4 = {
    ...storeFilter
  };

  // ===================================
  // PO FILTER
  // ===================================
  let poFilter = {
    status: {
      $in: PO_PENDING_STATUS
    }
  };

  if (
    !fullAccessRoles.includes(
      user.role
    )
  ) {
    const ids = user.store.map(
      (item) => item._id
    );

    const requestIds =
      await Request.distinct(
        "_id",
        {
          store: { $in: ids }
        }
      );

    poFilter.requisitionNo = {
      $in: requestIds
    };
  }

  // ===================================
  // PARALLEL QUERY
  // ===================================
  const [
    totalSubmitted,
    totalSubmittedTransfer,
    totalSubmittedMiv,
    totalSubmittedMrv,
    approvedMtn,

    totalRequestcompleted,
    requestTotal,

    totalMIVcompleted,
    mivTotal,

    totalTransfercompleted,
    transferTotal,

    totalMtncompleted,
    MtnTotal,

    totalMrvcompleted,
    MrvTotal,

    totalPendingPO,

    storeWiseCounts,
    mrvStoreEiseCounts,
    TranferStoreEiseCounts,
    MivStoreWise,
    MtnStoreWise
  ] = await Promise.all([
    Request.countDocuments(filter).setOptions({ skipPopulate: true }),

    Transfer.countDocuments(filter).setOptions({ skipPopulate: true }),

    Miv.countDocuments(filter).setOptions({ skipPopulate: true }),

    Mrv.countDocuments(filter2).setOptions({ skipPopulate: true }),

    Mtn.countDocuments(filter2).setOptions({ skipPopulate: true }),

    Request.countDocuments(filter3).setOptions({ skipPopulate: true }),

    Request.countDocuments(filter4).setOptions({ skipPopulate: true }),

    Miv.countDocuments(filter3).setOptions({ skipPopulate: true }),

    Miv.countDocuments(filter4).setOptions({ skipPopulate: true }),

    Transfer.countDocuments(filter3).setOptions({ skipPopulate: true }),

    Transfer.countDocuments(filter4).setOptions({ skipPopulate: true }),

    Mtntable.countDocuments(filter3).setOptions({ skipPopulate: true }),

    Mtntable.countDocuments(filter4).setOptions({ skipPopulate: true }),

    MrvTable.countDocuments(filter3).setOptions({ skipPopulate: true }),

    MrvTable.countDocuments(filter4).setOptions({ skipPopulate: true }),

    PurchaseOrder.countDocuments(poFilter).setOptions({ skipPopulate: true }),

    Request.aggregate([
      { $match: filter },
      {
        $group: {
          _id: "$store",
          count: { $sum: 1 }
        }
      },
      {
        $lookup: {
          from: "stores",
          localField: "_id",
          foreignField: "_id",
          as: "store"
        }
      },
      { $unwind: "$store" },
      {
        $project: {
          storeName: "$store.name",
          storeLocation: "$store.location",
          count: 1
        }
      }
    ]),

    Mrv.aggregate([
      { $match: filter2 },
      {
        $group: {
          _id: "$store",
          count: { $sum: 1 }
        }
      },
      {
        $lookup: {
          from: "stores",
          localField: "_id",
          foreignField: "_id",
          as: "store"
        }
      },
      { $unwind: "$store" },
      {
        $project: {
          storeName: "$store.name",
          storeLocation: "$store.location",
          count: 1
        }
      }
    ]),

    Transfer.aggregate([
      { $match: filter },
      {
        $group: {
          _id: "$storeFrom",
          count: { $sum: 1 }
        }
      },
      {
        $lookup: {
          from: "stores",
          localField: "_id",
          foreignField: "_id",
          as: "store"
        }
      },
      { $unwind: "$store" },
      {
        $project: {
          storeName: "$store.name",
          storeLocation: "$store.location",
          count: 1
        }
      }
    ]),

    Miv.aggregate([
      { $match: filter },
      {
        $group: {
          _id: "$store",
          count: { $sum: 1 }
        }
      },
      {
        $lookup: {
          from: "stores",
          localField: "_id",
          foreignField: "_id",
          as: "store"
        }
      },
      { $unwind: "$store" },
      {
        $project: {
          storeName: "$store.name",
          storeLocation: "$store.location",
          count: 1
        }
      }
    ]),

    Mtn.aggregate([
      { $match: filter2 },
      {
        $group: {
          _id: "$to",
          count: { $sum: 1 }
        }
      },
      {
        $lookup: {
          from: "stores",
          localField: "_id",
          foreignField: "_id",
          as: "store"
        }
      },
      { $unwind: "$store" },
      {
        $project: {
          storeName: "$store.name",
          storeLocation: "$store.location",
          count: 1
        }
      }
    ])
  ]);

  // ===================================
  // RESPONSE
  // ===================================
  res.status(200).json({
    status: "success",
    data: {
      MrvTotal,
      MtnTotal,
      mivTotal,
      requestTotal,
      transferTotal,
      totalMrvcompleted,
      totalMtncompleted,
      totalTransfercompleted,
      totalMIVcompleted,
      totalRequestcompleted,
      MtnStoreWise,
      MivStoreWise,
      TranferStoreEiseCounts,
      mrvStoreEiseCounts,
      storeWiseCounts,
      approvedMtn,
      totalSubmitted,
      totalSubmittedTransfer,
      totalSubmittedMiv,
      totalSubmittedMrv,
      totalPendingPO
    }
  });
});



exports.getAllPOCount = catchAsync(async (req, res, next) => {
  const user = req.user;
  console.log('Authenticated User:', user?.name || user?.email || user?._id);

  try {
    // Step 1: Find all Request IDs with status 'PO Pending'
    const poPendingRequests = await Request.find({ status: 'PO Pending' }).select('_id');
    const poPendingRequestIds = poPendingRequests.map(req => req._id);

    // Step 2: Run all count queries in parallel
    const [
      totalPendingPO,
      generatedPO,
      orderReceived,
      partiallOrderReceived,
      itemWithGeneratedPO
    ] = await Promise.all([
      // You already queried the requests above, so reuse the length
      Promise.resolve(poPendingRequestIds.length),

      PurchaseOrder.countDocuments({ status: 'Generated' }),
      PurchaseOrder.countDocuments({ status: 'Order-Received' }),
      PurchaseOrder.countDocuments({ status: 'Partially-Received' }),

      // Count items for those request IDs + approved + poStatus + PO status
      Item.aggregate([
        {
          $match: {
            requisitionNo: { $in: poPendingRequestIds },
            status: 'approved',
            poStatus: 'pending',
          }
        },
        {
          $lookup: {
            from: 'purchaseorders',
            localField: 'po',
            foreignField: '_id',
            as: 'purchaseOrder'
          }
        },
        { $unwind: '$purchaseOrder' },
        {
          $match: {
            'purchaseOrder.status': 'Generated'
          }
        },
        {
          $count: 'itemCount'
        }
      ])
    ]);

    const approvedItemWithGeneratedPO = itemWithGeneratedPO[0]?.itemCount || 0;

    // Return results
    res.status(200).json({
      status: 'success',
      data: {
        totalPendingPO,
        generatedPO,
        orderReceived,
        partiallOrderReceived,
        approvedItemWithGeneratedPO
      }
    });
  } catch (error) {
    console.error('Error in getAllPOCount:', error);
    return res.status(500).json({
      status: 'fail',
      message: 'Server Error while fetching PO counts'
    });
  }
});




exports.getDocumentWithItems = async (req, res) => {
  try {
    const { no, type, store } = req.body;

    if (!no || !type || !store) {
      return res.status(400).json({
        status: 'fail',
        message: 'Please provide no, type, and store',
      });
    }

    let document, items;

    if (type === 'transfer') {
      document = await Mtntable.findOne({ mrvNo: no, store: store }).populate("user", "name");
      if (!document) {
        return res.status(404).json({ status: 'fail', message: 'Transfer not found' });
      }
      items = await transferItem.find({ mrv: document._id }).populate('inventory');
    } else if (type === 'rv') {
      document = await MrvTable.findOne({ mrvNo: no, store: store });
      if (!document) {
        return res.status(404).json({ status: 'fail', message: 'Requisition not found' });
      }
      items = await Item.find({ mrv: document._id }).populate('inventory');
    } else if (type === 'miv') {
      document = await Miv.findOne({ mivNo: no, store: store });
      if (!document) {
        return res.status(404).json({ status: 'fail', message: 'Requisition not found' });
      }
      items = await usedItem.find({ miv: document._id }).populate('inventory');
    } else {
      return res.status(400).json({
        status: 'fail',
        message: 'Invalid type. Type must be either transfer or requisition',
      });
    }

    res.status(200).json({
      status: 'success',
      document,
      items,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ status: 'error', message: 'Internal Server Error' });
  }
};



exports.getDocumentWithItemsTest = async (req, res) => {
  try {
    const { no, type, store } = req.body;

    if (!no || !type || !store) {
      return res.status(400).json({
        status: "fail",
        message: "Please provide no, type, and store",
      });
    }

    if (!mongoose.Types.ObjectId.isValid(store)) {
      return res.status(400).json({
        status: "fail",
        message: "Invalid store ID format",
      });
    }

    const docNo = Number(no);
    const storeId = new mongoose.Types.ObjectId(store);

    /* =====================================================
       🔹 TRANSFER (MTN) – UNCHANGED
    ===================================================== */
    if (type === "transfer") {
      const result = await Mtntable.aggregate([
        { $match: { mrvNo: docNo } },

        /* USER */
        {
          $lookup: {
            from: "users",
            localField: "user",
            foreignField: "_id",
            as: "userDetails"
          }
        },
        { $unwind: { path: "$userDetails", preserveNullAndEmptyArrays: true } },

        /* TRANSFER ITEMS */
        {
          $lookup: {
            from: "transferitems",
            localField: "_id",
            foreignField: "mrv",
            as: "items"
          }
        },
        { $unwind: { path: "$items", preserveNullAndEmptyArrays: true } },

        /* 🔥 FROM STORE */
        {
          $lookup: {
            from: "stores",
            localField: "items.from",
            foreignField: "_id",
            as: "fromStore"
          }
        },
        { $unwind: { path: "$fromStore", preserveNullAndEmptyArrays: true } },

        /* 🔥 TO STORE */
        {
          $lookup: {
            from: "stores",
            localField: "items.to",
            foreignField: "_id",
            as: "toStore"
          }
        },
        { $unwind: { path: "$toStore", preserveNullAndEmptyArrays: true } },

        /* INVENTORY */
        {
          $lookup: {
            from: "inventories",
            localField: "items.inventory",
            foreignField: "_id",
            as: "inventory"
          }
        },
        { $unwind: { path: "$inventory", preserveNullAndEmptyArrays: true } },

        /* MASTER LIST */
        {
          $lookup: {
            from: "masterlists",
            localField: "inventory.masterItem",
            foreignField: "_id",
            as: "masterItem"
          }
        },
        { $unwind: { path: "$masterItem", preserveNullAndEmptyArrays: true } },

        /* UNITS */
        {
          $lookup: {
            from: "units",
            localField: "masterItem.unit",
            foreignField: "_id",
            as: "unit"
          }
        },

        /* 🔹 FINAL SHAPE */
        {
  $addFields: {
    "items.from": "$fromStore.name",   // ✅ STORE NAME
    "items.to": "$toStore.name",       // ✅ STORE NAME

    "items.masterItem": {
      partNo: "$masterItem.partNo",
      description: "$masterItem.description",
      unitName: { $arrayElemAt: ["$unit.name", 0] }
    },

    // 🔥 ADDED FIELDS (SAFE)
    "items.approveQty": { $ifNull: ["$items.approveQty", 0] },
    "items.damageQty": { $ifNull: ["$items.damageQty", 0] },

    user: {
      _id: "$userDetails._id",
      name: "$userDetails.name",
      email: "$userDetails.email"
    }
  }
},

        /* GROUP BACK */
        {
          $group: {
            _id: "$_id",
            mrvNo: { $first: "$mrvNo" },
            status: { $first: "$status" },
            createdAt: { $first: "$createdAt" },
            user: { $first: "$user" },
            items: { $push: "$items" }
          }
        }
      ]);

      if (!result.length) {
        return res.status(404).json({
          status: "fail",
          message: "MTN not found"
        });
      }

      return res.status(200).json({
        status: "success",
        document: result[0],
        type
      });
    }


    /* =====================================================
       🔹 NORMAL MRV – UNCHANGED
    ===================================================== */
    /* =====================================================
    🔹 NORMAL MRV – SAFE VERSION (FIXED)
 ===================================================== */
    if (type === "rv") {
      const exists = await MrvTable.findOne({ mrvNo: docNo, store: storeId });

      if (!exists) {
        return res.status(404).json({
          status: "fail",
          message: "MRV not found"
        });
      }

      const result = await MrvTable.aggregate([
        { $match: { mrvNo: docNo, store: storeId } },

        /* STORE */
        {
          $lookup: {
            from: "stores",
            localField: "store",
            foreignField: "_id",
            as: "storeInfo"
          }
        },
        { $unwind: { path: "$storeInfo", preserveNullAndEmptyArrays: true } },

        /* SUPPLIER */
        {
          $lookup: {
            from: "suppliersdetails",
            localField: "supplier",
            foreignField: "_id",
            as: "supplierInfo"
          }
        },
        { $unwind: { path: "$supplierInfo", preserveNullAndEmptyArrays: true } },

        /* USER */
        {
          $lookup: {
            from: "users",
            localField: "user",
            foreignField: "_id",
            as: "userInfo"
          }
        },
        { $unwind: { path: "$userInfo", preserveNullAndEmptyArrays: true } },

        /* ITEMS */
        {
          $lookup: {
            from: "items",
            localField: "_id",
            foreignField: "mrv",
            as: "items"
          }
        },
        { $unwind: { path: "$items", preserveNullAndEmptyArrays: true } },

        /* APPROVED BY ADMIN */
        {
          $lookup: {
            from: "users",
            localField: "items.approvedByAdmin",
            foreignField: "_id",
            as: "adminInfo"
          }
        },
        { $unwind: { path: "$adminInfo", preserveNullAndEmptyArrays: true } },

        /* APPROVED BY SUPER ADMIN */
        {
          $lookup: {
            from: "users",
            localField: "items.approvedBySuperAdmin",
            foreignField: "_id",
            as: "superAdminInfo"
          }
        },
        { $unwind: { path: "$superAdminInfo", preserveNullAndEmptyArrays: true } },

        /* INVENTORY */
        {
          $lookup: {
            from: "inventories",
            localField: "items.inventory",
            foreignField: "_id",
            as: "inventory"
          }
        },
        { $unwind: { path: "$inventory", preserveNullAndEmptyArrays: true } },

        /* MASTERLIST */
        {
          $lookup: {
            from: "masterlists",
            localField: "inventory.masterItem",
            foreignField: "_id",
            as: "masterItem"
          }
        },
        { $unwind: { path: "$masterItem", preserveNullAndEmptyArrays: true } },

        /* UNIT */
        {
          $lookup: {
            from: "units",
            localField: "masterItem.unit",
            foreignField: "_id",
            as: "unit"
          }
        },

        {
          $project: {
            mrvNo: 1,
            billingNo: 1,
            billingDate: 1,
            storeName: "$storeInfo.name",
            storeCode: "$storeInfo.storeCode",
            supplierName: "$supplierInfo.name",
            userName: "$userInfo.name",
            status: 1,
            createdAt: 1,

            approvedByAdmin: {
              _id: "$adminInfo._id",
              name: "$adminInfo.name",
              approvedAt: "$items.adminApprovedAt"
            },

            approvedBySuperAdmin: {
              _id: "$superAdminInfo._id",
              name: "$superAdminInfo.name",
              approvedAt: "$items.superAdminApprovedAt"
            },

            items: {
              inventoryId: "$inventory._id",
              masterItem: "$masterItem._id",
              qtyRequired: "$items.qtyRequired",
              approveQty: "$items.approveQty",
              qtyRecived: "$items.qtyRecived",
              status: "$items.status",
              remark: "$items.remark",
              partNo: "$masterItem.partNo",
              description: "$masterItem.description",
              unitName: { $arrayElemAt: ["$unit.name", 0] }
            }
          }
        },

        {
          $group: {
            _id: "$_id",
            mrvNo: { $first: "$mrvNo" },
            billingNo: { $first: "$billingNo" },
            billingDate: { $first: "$billingDate" },
            storeName: { $first: "$storeName" },
            storeCode: { $first: "$storeCode" },
            supplierName: { $first: "$supplierName" },
            userName: { $first: "$userName" },
            status: { $first: "$status" },
            createdAt: { $first: "$createdAt" },

            approvedByAdmin: { $first: "$approvedByAdmin" },
            approvedBySuperAdmin: { $first: "$approvedBySuperAdmin" },

            items: { $push: "$items" }
          }
        }
      ]);

      if (!result.length) {
        return res.status(404).json({
          status: "fail",
          message: "MRV found but related lookup data missing"
        });
      }

      return res.status(200).json({
        status: "success",
        document: result[0],
        type
      });
    }



    /**** ==== miv */

    /* =====================================================
   🔹 MATERIAL ISSUE VOUCHER (MIV) – RESTORED ✅
===================================================== */
  if (type === "miv") {
  const exists = await Miv.findOne({ mivNo: docNo, store: storeId });

  if (!exists) {
    return res.status(404).json({
      status: "fail",
      message: "MIV not found"
    });
  }

  const result = await Miv.aggregate([
    { $match: { mivNo: docNo, store: storeId } },

    { $lookup: { from: "stores", localField: "store", foreignField: "_id", as: "storeInfo" } },
    { $unwind: "$storeInfo" },

    { $lookup: { from: "users", localField: "user", foreignField: "_id", as: "userInfo" } },
    { $unwind: "$userInfo" },

    /* 🔹 USED ITEMS */
    {
      $lookup: {
        from: "useditems",
        localField: "_id",
        foreignField: "miv",
        as: "items"
      }
    },
    { $unwind: "$items" },

    /* 🔥 APPROVED BY LOOKUP */
    {
      $lookup: {
        from: "users",
        localField: "items.approveBy",
        foreignField: "_id",
        as: "approvedByUser"
      }
    },
    {
      $unwind: {
        path: "$approvedByUser",
        preserveNullAndEmptyArrays: true
      }
    },

    { $lookup: { from: "inventories", localField: "items.inventory", foreignField: "_id", as: "inventory" } },
    { $unwind: "$inventory" },

    { $lookup: { from: "masterlists", localField: "inventory.masterItem", foreignField: "_id", as: "masterItem" } },
    { $unwind: "$masterItem" },

    { $lookup: { from: "units", localField: "masterItem.unit", foreignField: "_id", as: "unit" } },

    /* 🔹 FINAL SHAPE */
    {
      $project: {
        mivNo: 1,
        store: "$storeInfo.name",
        storeCode: "$storeInfo.storeCode",

        // ✅ NEW FIELD (ADDED)
        storeLocation: "$storeInfo.location",

        user: "$userInfo.name",
        status: 1,
        createdAt: 1,
        updatedAt: "$items.updatedAt",

        items: {
          inventoryId: "$inventory._id",
          masterItem: "$masterItem._id",
          partNo: "$masterItem.partNo",
          description: "$masterItem.description",
          unitName: { $arrayElemAt: ["$unit.name", 0] },
          approveQty: "$items.approveQty",
          usedQty: "$items.usedQty",

          approvedBy: { $ifNull: ["$approvedByUser.name", ""] },

          remark: { $ifNull: ["$items.remark", ""] },
          status: "$items.status",
          updatedAt: "$items.updatedAt"
        }
      }
    },

    {
      $group: {
        _id: "$_id",
        mivNo: { $first: "$mivNo" },
        store: { $first: "$store" },
        storeCode: { $first: "$storeCode" },

        // ✅ NEW FIELD (ADDED)
        storeLocation: { $first: "$storeLocation" },

        user: { $first: "$user" },
        status: { $first: "$status" },
        createdAt: { $first: "$createdAt" },
        updatedAt: { $max: "$updatedAt" },
        items: { $push: "$items" }
      }
    }
  ]);

  return res.status(200).json({
    status: "success",
    document: result[0],
    type
  });
}




    /* =====================================================
      🔹 TRANSFER REQUEST (RESTORED ✅)
   ===================================================== */
    if (type === "transferrequest") {
      const result = await Transfer.aggregate([
        {
          $match: {
            transferNo: docNo,
            $or: [
              { storeFrom: storeId },
              { store: storeId }
            ]
          }
        },

        { $lookup: { from: "users", localField: "user", foreignField: "_id", as: "userDetails" } },
        { $unwind: { path: "$userDetails", preserveNullAndEmptyArrays: true } },

        { $lookup: { from: "transferitems", localField: "_id", foreignField: "transfer", as: "items" } },
        { $unwind: { path: "$items", preserveNullAndEmptyArrays: true } },

        { $lookup: { from: "stores", localField: "items.from", foreignField: "_id", as: "fromStore" } },
        { $lookup: { from: "stores", localField: "items.to", foreignField: "_id", as: "toStore" } },

        { $lookup: { from: "inventories", localField: "items.inventory", foreignField: "_id", as: "inventory" } },
        { $unwind: { path: "$inventory", preserveNullAndEmptyArrays: true } },

        { $lookup: { from: "masterlists", localField: "inventory.masterItem", foreignField: "_id", as: "masterItem" } },
        { $unwind: { path: "$masterItem", preserveNullAndEmptyArrays: true } },

        { $lookup: { from: "units", localField: "masterItem.unit", foreignField: "_id", as: "unit" } },

        {
          $addFields: {
            "items.from": {
              $ifNull: [{ $arrayElemAt: ["$fromStore.name", 0] }, ""]
            },
            "items.to": {
              $ifNull: [{ $arrayElemAt: ["$toStore.name", 0] }, ""]
            },
            "items.masterItem": {
              partNo: "$masterItem.partNo",
              description: "$masterItem.description",
              unitName: { $arrayElemAt: ["$unit.name", 0] }
            },
            "items.updatedAt": "$items.updatedAt",
            user: {
              _id: "$userDetails._id",
              name: "$userDetails.name",
              email: "$userDetails.email"
            }
          }
        },

        {
          $group: {
            _id: "$_id",
            transferNo: { $first: "$transferNo" },
            status: { $first: "$status" },
            createdAt: { $first: "$createdAt" },
            user: { $first: "$user" },
            items: { $push: "$items" }
          }
        }
      ]);

      if (!result.length) {
        return res.status(404).json({
          status: "fail",
          message: "Transfer Request not found"
        });
      }

      return res.status(200).json({
        status: "success",
        document: result[0],
        type
      });
    }


    /* =====================================================
       🔹 REPAIR MRV – ✅ MASTERLIST + INVENTORY
    ===================================================== */
    /* =====================================================
   🔹 REPAIR MRV – INVENTORY + MASTERLIST DETAILS
===================================================== */
    if (type === "repair-mrv") {
      const exists = await RepairMrv.findOne({
        repairMrvNo: docNo,
        store: storeId
      });

      if (!exists) {
        return res.status(404).json({
          status: "fail",
          message: "Repair MRV not found"
        });
      }

      const result = await RepairMrv.aggregate([
        /* =============================
           MATCH MRV
        ============================= */
        {
          $match: {
            _id: exists._id   // ✅ USE _id (STRONGER)
          }
        },

        /* =============================
           STORE
        ============================= */
        {
          $lookup: {
            from: "stores",
            localField: "store",
            foreignField: "_id",
            as: "storeInfo"
          }
        },
        { $unwind: "$storeInfo" },

        /* =============================
           SUPPLIER
        ============================= */
        {
          $lookup: {
            from: "suppliersdetails",
            localField: "supplier",
            foreignField: "_id",
            as: "supplierInfo"
          }
        },
        { $unwind: "$supplierInfo" },

        /* =============================
           USER
        ============================= */
        {
          $lookup: {
            from: "users",
            localField: "user",
            foreignField: "_id",
            as: "userInfo"
          }
        },
        { $unwind: "$userInfo" },

        /* =============================
           REPAIR ITEMS (SAFE)
        ============================= */
        {
          $lookup: {
            from: "repairitems",
            localField: "_id",
            foreignField: "repairMrv",
            as: "items"
          }
        },
        {
          $unwind: {
            path: "$items",
            preserveNullAndEmptyArrays: true // ✅ CRITICAL
          }

        },
        /* =============================
           APPROVED BY ADMIN
        ============================= */
        {
          $lookup: {
            from: "users",
            localField: "items.approvedByAdmin",
            foreignField: "_id",
            as: "adminInfo"
          }
        },
        {
          $unwind: {
            path: "$adminInfo",
            preserveNullAndEmptyArrays: true
          }
        },

        /* =============================
           APPROVED BY SUPER ADMIN
        ============================= */
        {
          $lookup: {
            from: "users",
            localField: "items.approvedBySuperAdmin",
            foreignField: "_id",
            as: "superAdminInfo"
          }
        },
        {
          $unwind: {
            path: "$superAdminInfo",
            preserveNullAndEmptyArrays: true
          }
        },

        /* =============================
           INVENTORY
        ============================= */
        {
          $lookup: {
            from: "inventories",
            localField: "items.inventory",
            foreignField: "_id",
            as: "inventory"
          }
        },
        {
          $unwind: {
            path: "$inventory",
            preserveNullAndEmptyArrays: true
          }
        },

        /* =============================
           INVENTORY → MASTERLIST
        ============================= */
        {
          $lookup: {
            from: "masterlists",
            localField: "inventory.masterItem",
            foreignField: "_id",
            as: "inventoryMaster"
          }
        },
        {
          $unwind: {
            path: "$inventoryMaster",
            preserveNullAndEmptyArrays: true
          }
        },

        /* =============================
           REPAIR ITEM → MASTERLIST
        ============================= */
        {
          $lookup: {
            from: "masterlists",
            localField: "items.masterlist",
            foreignField: "_id",
            as: "repairMaster"
          }
        },
        {
          $unwind: {
            path: "$repairMaster",
            preserveNullAndEmptyArrays: true
          }
        },

        /* =============================
           UNITS
        ============================= */
        {
          $lookup: {
            from: "units",
            localField: "inventoryMaster.unit",
            foreignField: "_id",
            as: "inventoryUnit"
          }
        },
        {
          $lookup: {
            from: "units",
            localField: "repairMaster.unit",
            foreignField: "_id",
            as: "repairUnit"
          }
        },

        /* =============================
           ROW SHAPE
        ============================= */
        {
          $project: {
            repairMrvNo: 1,
            billingNo: 1,
            billingDate: 1,
            status: 1,
            createdAt: 1,

            storeName: "$storeInfo.name",
            storeCode: "$storeInfo.storeCode",
            supplierName: "$supplierInfo.name",
            userName: "$userInfo.name",

            approvedByAdmin: {
              _id: "$adminInfo._id",
              name: "$adminInfo.name",
              approvedAt: "$items.adminApprovedAt"   // ✅ ADD THIS
            },

            approvedBySuperAdmin: {
              _id: "$superAdminInfo._id",
              name: "$superAdminInfo.name",
              approvedAt: "$items.superAdminApprovedAt" // ✅ ADD THIS
            },


            row: {
              inventoryId: "$inventory._id",

              inventoryPartNo: "$inventoryMaster.partNo",
              inventoryDescription: "$inventoryMaster.description",
              inventoryUnit: { $arrayElemAt: ["$inventoryUnit.name", 0] },

              masterlistPartNo: "$repairMaster.partNo",
              masterlistDescription: "$repairMaster.description",
              masterlistUnit: { $arrayElemAt: ["$repairUnit.name", 0] },

              qtyRequired: "$items.qtyRequired",
              approveQty: "$items.approveQty",
              qtyRecived: "$items.qtyRecived",
              status: "$items.status",
              updatedAt: "$items.updatedAt"
            }
          }
        },

        /* =============================
           GROUP BACK (FILTER SAFELY)
        ============================= */
        {
          $group: {
            _id: "$_id",
            repairMrvNo: { $first: "$repairMrvNo" },
            billingNo: { $first: "$billingNo" },
            billingDate: { $first: "$billingDate" },
            storeName: { $first: "$storeName" },
            storeCode: { $first: "$storeCode" },
            supplierName: { $first: "$supplierName" },
            userName: { $first: "$userName" },
            status: { $first: "$status" },
            createdAt: { $first: "$createdAt" },
            approvedByAdmin: {
              $first: {
                $cond: [
                  { $ne: ["$approvedByAdmin._id", null] },
                  "$approvedByAdmin",
                  "$$REMOVE"
                ]
              }
            },

            approvedBySuperAdmin: {
              $first: {
                $cond: [
                  { $ne: ["$approvedBySuperAdmin._id", null] },
                  "$approvedBySuperAdmin",
                  "$$REMOVE"
                ]
              }
            },

            items: {
              $push: {
                $cond: [
                  { $ne: ["$row.inventoryId", null] },
                  "$row",
                  "$$REMOVE"
                ]
              }
            }
          }
        }
      ]);

      return res.status(200).json({
        status: "success",
        type,
        document: result[0] || {
          repairMrvNo: exists.repairMrvNo,
          storeName: exists.store,
          items: []
        }
      });
    }


    //==== requsition==

    if (type === "requisition") {

      const exists = await Request.findOne({
        requisitionNo: docNo,
        store: storeId
      })
        .select("_id store")
        .lean();

      if (!exists) {
        return res.status(404).json({
          status: "fail",
          message: "Requisition not found for this store"
        });
      }

      const result = await Request.aggregate([
        {
          $match: { _id: exists._id }
        },

        {
          $lookup: {
            from: "stores",
            localField: "store",
            foreignField: "_id",
            as: "storeInfo"
          }
        },
        { $unwind: { path: "$storeInfo", preserveNullAndEmptyArrays: true } },

        {
          $lookup: {
            from: "users",
            localField: "user",
            foreignField: "_id",
            as: "userInfo"
          }
        },
        { $unwind: { path: "$userInfo", preserveNullAndEmptyArrays: true } },

        {
          $lookup: {
            from: "items",
            localField: "_id",
            foreignField: "requisitionNo",
            as: "items"
          }
        },
        { $unwind: { path: "$items", preserveNullAndEmptyArrays: true } },

        {
          $lookup: {
            from: "purchaseorders",
            localField: "items.po",
            foreignField: "_id",
            as: "poInfo"
          }
        },
        { $unwind: { path: "$poInfo", preserveNullAndEmptyArrays: true } },

        {
          $lookup: {
            from: "users",
            localField: "items.approvedByAdmin",
            foreignField: "_id",
            as: "adminInfo"
          }
        },
        { $unwind: { path: "$adminInfo", preserveNullAndEmptyArrays: true } },

        {
          $lookup: {
            from: "users",
            localField: "items.approvedBySuperAdmin",
            foreignField: "_id",
            as: "superAdminInfo"
          }
        },
        { $unwind: { path: "$superAdminInfo", preserveNullAndEmptyArrays: true } },

        {
          $lookup: {
            from: "inventories",
            localField: "items.inventory",
            foreignField: "_id",
            as: "inventory"
          }
        },
        { $unwind: { path: "$inventory", preserveNullAndEmptyArrays: true } },

        {
          $lookup: {
            from: "masterlists",
            localField: "inventory.masterItem",
            foreignField: "_id",
            as: "masterItem"
          }
        },
        { $unwind: { path: "$masterItem", preserveNullAndEmptyArrays: true } },

        {
          $lookup: {
            from: "units",
            localField: "masterItem.unit",
            foreignField: "_id",
            as: "unit"
          }
        },

        {
          $project: {
            requisitionNo: 1,
            status: 1,
            createdAt: 1,
            storeName: "$storeInfo.name",
            storeCode: "$storeInfo.storeCode",

            user: {
              _id: "$userInfo._id",
              name: "$userInfo.name",
              email: "$userInfo.email"
            },

            itemRow: {
              _id: "$items._id",
              qtyRequired: "$items.qtyRequired",
              approveQty: "$items.approveQty",
              status: "$items.status",
              remark: "$items.remark",
              partNo: "$masterItem.partNo",
              description: "$masterItem.description",
              unitName: { $arrayElemAt: ["$unit.name", 0] },
              poNumber: "$poInfo.poNumber",

              approvedByAdmin: {
                _id: "$adminInfo._id",
                name: "$adminInfo.name"
              },
              adminApprovedAt: "$items.adminApprovedAt",

              approvedBySuperAdmin: {
                _id: "$superAdminInfo._id",
                name: "$superAdminInfo.name"
              },
              superAdminApprovedAt: "$items.superAdminApprovedAt"
            }
          }
        },

        {
          $group: {
            _id: "$_id",
            requisitionNo: { $first: "$requisitionNo" },
            status: { $first: "$status" },
            createdAt: { $first: "$createdAt" },
            storeName: { $first: "$storeName" },
            storeCode: { $first: "$storeCode" },
            user: { $first: "$user" },
            items: {
              $push: {
                $cond: [
                  { $ne: ["$itemRow._id", null] },
                  "$itemRow",
                  "$$REMOVE"
                ]
              }
            }
          }
        }
      ]);

      return res.status(200).json({
        status: "success",
        document: result[0],
        type
      });
    }








    /* =====================================================
       ❌ INVALID TYPE
    ===================================================== */
    return res.status(400).json({
      status: "fail",
      message: "Invalid type"
    });

  } catch (error) {
    console.error("Controller Error:", error);
    return res.status(500).json({
      status: "error",
      message: "Internal Server Error",
      error: error.message
    });
  }
};



















