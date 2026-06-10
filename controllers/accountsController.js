const PurchaseOrder = require('../models/PurchaseOrder');
const mongoose = require("mongoose");
const Item = require("../models/itemModel"); // update path
const Inventory = require("../models/inventoryModel");
const MasterList = require("../models/masterListModel");
const Unit = require("../models/unitModel");
const MRV = require("../models/mrvFormModel");
const Request = require("../models/requestedModel");
const catchAsync = require('../utils/catchAsync');
const AppError = require('../utils/appError');





//old one 
exports.getAccountDataBySearch = async (req, res) => {
    try {
        let { poNumber, supplier, store, totalAmount, amount, fromDate, toDate, billNo, amountCriteria, } = req.body;

        // normalize supplier
        if (supplier && !Array.isArray(supplier)) {
            supplier = [supplier];
        }

        const finalAmount = totalAmount || amount;

        let matchStage = {};

        const filtersUsed = [];

        // ✅ PO
        if (poNumber) {
            filtersUsed.push("po");
        }

        // ✅ SUPPLIER
        if (supplier && supplier.length > 0) {
            filtersUsed.push("supplier");
        }

        // ✅ STORE
        if (store) {
            filtersUsed.push("store");
        }

        // ✅ AMOUNT
        if (
            finalAmount !== undefined &&
            finalAmount !== "" &&
            amountCriteria
        ) {
            filtersUsed.push("amount");
        }

        // ✅ DATE
        if (fromDate || toDate) {
            filtersUsed.push("date");
        }

        // ✅ BILL
        if (billNo) {
            filtersUsed.push("bill");
        }

        if (filtersUsed.length !== 1) {
            return res.status(400).json({
                status: "fail",
                message: "Please use only one filter at a time"
            });
        }

        // ✅ PO NUMBER
        if (poNumber) {
            matchStage.poNumber = poNumber.trim();
        }


        // ✅ AMOUNT WITH CRITERIA
        // ✅ FAST AMOUNT SEARCH
        // ✅ AMOUNT WITH CRITERIA
        if (
            finalAmount !== undefined &&
            finalAmount !== "" &&
            amountCriteria
        ) {

            const operatorMap = {
                gt: "$gt",
                lt: "$lt",
                gte: "$gte",
                lte: "$lte",
                eq: "$eq"
            };

            const mongoOperator = operatorMap[amountCriteria];

            if (mongoOperator) {

                // ✅ DIRECT INDEX FILTER
                matchStage.totalAmount = {
                    [mongoOperator]: Number(finalAmount)
                };
            }
        }

        // ✅ DATE RANGE
        if (fromDate || toDate) {
            matchStage.createdAt = {};

            if (fromDate) {
                matchStage.createdAt.$gte = new Date(fromDate);
            }

            if (toDate) {
                const end = new Date(toDate);
                end.setDate(end.getDate() + 1);
                matchStage.createdAt.$lt = end;
            }
        }

        let poFilterIds = null;

        // ✅ BILL SEARCH (NEW 🔥)
        if (billNo) {
            const numeric = Number(billNo);

            // ✅ STRICT EXACT MATCH ONLY (NO REGEX)
            const query = !isNaN(numeric)
                ? { billingNo: numeric }
                : { billingNo: billNo };

            const mrvs = await mongoose.connection.collection("mrvs")
                .find(query)
                .project({ _id: 1 })
                .toArray();

            const mrvIds = mrvs.map(m => m._id);

            if (mrvIds.length === 0) {
                return res.status(200).json({
                    status: "success",
                    results: 0,
                    data: []
                });
            }

            const items = await mongoose.connection.collection("items")
                .find({ mrv: { $in: mrvIds } })
                .project({ po: 1 })
                .toArray();

            const poIds = [...new Set(items.map(i => i.po?.toString()).filter(Boolean))];

            poFilterIds = poIds.map(id => new mongoose.Types.ObjectId(id));

            matchStage._id = { $in: poFilterIds };
        }

        // ✅ STORE SEARCH (NEW 🔥)
        if (store) {

            // 1️⃣ GET REQUEST IDS FROM STORE
            const requests = await mongoose.connection.collection("requests")
                .find({ store: new mongoose.Types.ObjectId(store) })
                .project({ _id: 1 })
                .toArray();

            const requestIds = requests.map(r => r._id);

            if (requestIds.length === 0) {
                return res.status(200).json({
                    status: "success",
                    results: 0,
                    data: []
                });
            }

            // 2️⃣ GET ITEMS FROM REQUEST
            const items = await mongoose.connection.collection("items")
                .find({ requisitionNo: { $in: requestIds } })
                .project({ po: 1 })
                .toArray();

            const poIds = [...new Set(items.map(i => i.po?.toString()).filter(Boolean))];

            if (poIds.length === 0) {
                return res.status(200).json({
                    status: "success",
                    results: 0,
                    data: []
                });
            }

            poFilterIds = poIds.map(id => new mongoose.Types.ObjectId(id));

            matchStage._id = { $in: poFilterIds };
        }

        const data = await PurchaseOrder.aggregate([

            { $match: matchStage },



            ...(supplier && supplier.length ? [{
                $match: {
                    "items.supplier": {
                        $in: supplier.map(id => new mongoose.Types.ObjectId(id))
                    }
                }
            }] : []),

            {
                $addFields: {
                    supplierId: { $arrayElemAt: ["$items.supplier", 0] }
                }
            },

            {
                $lookup: {
                    from: "items",
                    let: { poId: "$_id" },
                    pipeline: [
                        {
                            $match: {
                                $expr: { $eq: ["$po", "$$poId"] }
                            }
                        },

                        // INVENTORY
                        {
                            $lookup: {
                                from: "inventories",
                                localField: "inventory",
                                foreignField: "_id",
                                as: "inventoryData"
                            }
                        },
                        { $unwind: { path: "$inventoryData", preserveNullAndEmptyArrays: true } },

                        // MASTER LIST
                        {
                            $lookup: {
                                from: "masterlists",
                                localField: "inventoryData.masterItem",
                                foreignField: "_id",
                                as: "masterItemData"
                            }
                        },
                        { $unwind: { path: "$masterItemData", preserveNullAndEmptyArrays: true } },

                        // UNIT
                        {
                            $lookup: {
                                from: "units",
                                localField: "masterItemData.unit",
                                foreignField: "_id",
                                as: "unitData"
                            }
                        },
                        { $unwind: { path: "$unitData", preserveNullAndEmptyArrays: true } },

                        // 🔥 ADMIN USER
                        {
                            $lookup: {
                                from: "users",
                                localField: "approvedByAdmin",
                                foreignField: "_id",
                                as: "adminUser"
                            }
                        },
                        { $unwind: { path: "$adminUser", preserveNullAndEmptyArrays: true } },

                        // 🔥 SUPER ADMIN USER
                        {
                            $lookup: {
                                from: "users",
                                localField: "approvedBySuperAdmin",
                                foreignField: "_id",
                                as: "superAdminUser"
                            }
                        },
                        { $unwind: { path: "$superAdminUser", preserveNullAndEmptyArrays: true } },

                        // FINAL OUTPUT
                        {
                            $project: {
                                qtyRequired: 1,
                                approveQty: 1,
                                qtyRecived: 1,
                                status: 1,
                                mrv: 1,

                                partNo: "$masterItemData.partNo",
                                description: "$masterItemData.description",
                                unit: "$unitData.name",

                                // ✅ FINAL FIX (NAMES + DATE)
                                approvedByAdmin: "$adminUser.name",
                                adminApprovedAt: 1,
                                approvedBySuperAdmin: "$superAdminUser.name",
                                superAdminApprovedAt: 1
                            }
                        }
                    ],
                    as: "items"
                }
            },

            {
                $lookup: {
                    from: "suppliersdetails",
                    localField: "supplierId",
                    foreignField: "_id",
                    as: "supplierData"
                }
            },
            { $unwind: { path: "$supplierData", preserveNullAndEmptyArrays: true } },

            {
                $lookup: {
                    from: "requests",
                    let: { reqId: "$requisitionNo" },
                    pipeline: [
                        {
                            $match: {
                                $expr: { $eq: ["$_id", "$$reqId"] }
                            }
                        },

                        // 🔥 STORE JOIN
                        {
                            $lookup: {
                                from: "stores",
                                localField: "store",
                                foreignField: "_id",
                                as: "storeData"
                            }
                        },
                        { $unwind: { path: "$storeData", preserveNullAndEmptyArrays: true } },

                        // 🔥 USER JOIN
                        {
                            $lookup: {
                                from: "users",
                                localField: "user",
                                foreignField: "_id",
                                as: "userData"
                            }
                        },
                        { $unwind: { path: "$userData", preserveNullAndEmptyArrays: true } },

                        {
                            $project: {
                                requisitionNo: 1,
                                storeName: "$storeData.name",
                                storeCode: "$storeData.storeCode",
                                userName: "$userData.name",
                                requestStatus: "$status"   // ✅ ADD THIS
                            }
                        }
                    ],
                    as: "request"
                }
            },
            { $unwind: "$request" },

            {
                $addFields: {
                    mrvIds: {
                        $setUnion: [
                            [],
                            {
                                $map: {
                                    input: "$items",
                                    as: "i",
                                    in: "$$i.mrv"
                                }
                            }
                        ]
                    }
                }
            },

            {
                $lookup: {
                    from: "mrvs",
                    let: { ids: "$mrvIds" },
                    pipeline: [
                        {
                            $match: {
                                $expr: { $in: ["$_id", "$$ids"] }
                            }
                        },
                        // 🔥 STORE JOIN
                        {
                            $lookup: {
                                from: "stores",
                                localField: "store",
                                foreignField: "_id",
                                as: "storeData"
                            }
                        },
                        { $unwind: { path: "$storeData", preserveNullAndEmptyArrays: true } },

                        // 🔥 USER JOIN
                        {
                            $lookup: {
                                from: "users",
                                localField: "user",
                                foreignField: "_id",
                                as: "userData"
                            }
                        },
                        { $unwind: { path: "$userData", preserveNullAndEmptyArrays: true } },

                        {
                            $project: {
                                _id: 1,  // ✅ IMPORTANT FIX

                                mrvNo: 1,
                                billingNo: 1,
                                billingTitle: 1,
                                billingDate: 1,
                                totalAmount: 1,
                                otherCharges: 1,
                                // ✅ ONLY RAW IMAGE FIELD (NO PATH LOGIC)
                                image: 1,
                                storeName: "$storeData.name",
                                userName: "$userData.name"
                            }
                        }
                    ],
                    as: "mrvDetails"
                }
            },

            {
                $lookup: {
                    from: "billingdeparts", // ⚠️ confirm collection name
                    let: { mrvIds: "$mrvIds" },
                    pipeline: [
                        {
                            $match: {
                                $expr: {
                                    $gt: [
                                        {
                                            $size: {
                                                $setIntersection: ["$mrvIds", "$$mrvIds"]
                                            }
                                        },
                                        0
                                    ]
                                }
                            }
                        },
                        {
                            $project: {
                                mrvIds: 1,
                                otherDoc: 1
                            }
                        }
                    ],
                    as: "billingData"
                }
            },

            {
                $addFields: {
                    mrvDetails: {
                        $map: {
                            input: "$mrvDetails",
                            as: "mrv",
                            in: {
                                $mergeObjects: [
                                    "$$mrv",
                                    {
                                        otherDoc: {
                                            $ifNull: [
                                                {
                                                    $let: {
                                                        vars: {
                                                            match: {
                                                                $arrayElemAt: [
                                                                    {
                                                                        $filter: {
                                                                            input: "$billingData",
                                                                            as: "b",
                                                                            cond: {
                                                                                $in: ["$$mrv._id", "$$b.mrvIds"]
                                                                            }
                                                                        }
                                                                    },
                                                                    0
                                                                ]
                                                            }
                                                        },
                                                        in: "$$match.otherDoc"
                                                    }
                                                },
                                                ""   // ✅ fallback (important)
                                            ]
                                        }
                                    }
                                ]
                            }
                        }
                    }
                }
            },

            {
                $project: {
                    _id: 0,
                    poId: "$_id",           // ✅ send poId
                    poNumber: 1,
                    totalAmount: 1,
                    status: 1,
                    createdAt: 1,
                    supplierName: "$supplierData.name",
                    supplierId: "$supplierData._id",
                    requisitionNo: "$request.requisitionNo",
                    requisitionStatus: "$request.requestStatus", // 🔥 NEW

                    // ✅ ADD THESE 3 FIELDS
                    poType: 1,
                    advanceRentalAmount: 1,
                    advanceRentalPercent: 1,

                    // 🔥 ADD HERE (TOP LEVEL)
                    storeName: "$request.storeName",
                    storeCode: "$request.storeCode",
                    requestedBy: "$request.userName",

                    items: {
                        $map: {
                            input: "$items",
                            as: "item",
                            in: {
                                poNumber: "$poNumber",
                                requisitionNo: "$request.requisitionNo",
                                qtyRequired: "$$item.qtyRequired",
                                approveQty: "$$item.approveQty",
                                qtyRecived: "$$item.qtyRecived",
                                status: "$$item.status",

                                partNo: "$$item.partNo",
                                description: "$$item.description",
                                unit: "$$item.unit",

                                // ✅ NEW (APPROVAL DATA)
                                approvedByAdmin: "$$item.approvedByAdmin",
                                adminApprovedAt: "$$item.adminApprovedAt",
                                approvedBySuperAdmin: "$$item.approvedBySuperAdmin",
                                superAdminApprovedAt: "$$item.superAdminApprovedAt",

                                mrvNo: {
                                    $let: {
                                        vars: {
                                            m: {
                                                $arrayElemAt: [
                                                    {
                                                        $filter: {
                                                            input: "$mrvDetails",
                                                            as: "x",
                                                            cond: { $eq: ["$$x._id", "$$item.mrv"] }
                                                        }
                                                    },
                                                    0
                                                ]
                                            }
                                        },
                                        in: "$$m.mrvNo"
                                    }
                                }
                            }
                        }
                    },

                    mrvDetails: 1
                }
            },
            // ✅ ADD THIS (VERY IMPORTANT)
            {
                $sort: { createdAt: -1 }
            }

        ]).allowDiskUse(true);;

        res.status(200).json({
            status: "success",
            results: data.length,
            data
        });

    } catch (error) {
        console.error(error);
        res.status(500).json({
            status: "error",
            message: "Something went wrong"
        });
    }
};

//using this fater controller to show teh account tabale data

exports.getAccountTableData = async (req, res) => {
    try {

        let {
            poNumber,
            supplier,
            store,
            amount,
            amountCriteria,
            billNo,
            createdMonthRange,
            billingMonthRange
        } = req.body;

        if (supplier && !Array.isArray(supplier)) {
            supplier = [supplier];
        }

        let matchStage = {};

        if (poNumber) {
            matchStage.poNumber = poNumber.trim();
        }

        if (amount && amountCriteria) {
            const operatorMap = {
                gt: "$gt",
                lt: "$lt",
                gte: "$gte",
                lte: "$lte",
                eq: "$eq"
            };

            matchStage.totalAmount = {
                [operatorMap[amountCriteria]]: Number(amount)
            };
        }

        if (createdMonthRange > 0) {
            const from = new Date();
            from.setMonth(from.getMonth() - createdMonthRange);

            matchStage.createdAt = {
                $gte: from
            };
        }

        const data = await PurchaseOrder.aggregate([

            { $match: matchStage },

            {
                $project: {
                    poNumber: 1,
                    totalAmount: 1,
                    status: 1,
                    createdAt: 1,
                    requisitionNo: 1,
                    poType: 1,
                    advanceRentalAmount: 1,
                    advanceRentalPercent: 1,
                    supplierIds: "$items.supplier",
                    supplierId: {
                        $arrayElemAt: ["$items.supplier", 0]
                    }
                }
            },

            {
                $lookup: {
                    from: "items",
                    localField: "_id",
                    foreignField: "po",
                    as: "itemData"
                }
            },

            {
                $lookup: {
                    from: "suppliersdetails",
                    localField: "supplierId",
                    foreignField: "_id",
                    as: "supplierData"
                }
            },
            {
                $unwind: {
                    path: "$supplierData",
                    preserveNullAndEmptyArrays: true
                }
            },

            ...(supplier && supplier.length ? [{
                $match: {
                    supplierIds: {
                        $elemMatch: {
                            $in: supplier.map(id => new mongoose.Types.ObjectId(id))
                        }
                    }
                }
            }] : []),

            {
                $lookup: {
                    from: "requests",
                    localField: "requisitionNo",
                    foreignField: "_id",
                    as: "requestData"
                }
            },
            {
                $unwind: {
                    path: "$requestData",
                    preserveNullAndEmptyArrays: true
                }
            },

            {
                $lookup: {
                    from: "stores",
                    localField: "requestData.store",
                    foreignField: "_id",
                    as: "storeData"
                }
            },
            {
                $unwind: {
                    path: "$storeData",
                    preserveNullAndEmptyArrays: true
                }
            },

            ...(store ? [{
                $match: {
                    "storeData._id": new mongoose.Types.ObjectId(store)
                }
            }] : []),

            {
                $lookup: {
                    from: "mrvs",
                    localField: "itemData.mrv",
                    foreignField: "_id",
                    as: "mrvDetails"
                }
            },

            // 🔥 ADD PAYMENT WORKFLOW
            {
                $lookup: {
                    from: "paymentworkflows",
                    localField: "_id",
                    foreignField: "po",
                    as: "paymentData"
                }
            },
            {
                $unwind: {
                    path: "$paymentData",
                    preserveNullAndEmptyArrays: true
                }
            },

            // 🔥 ONLY ACCOUNTS PENDING
            {
                $match: {
                    "paymentData.status": "Accounts Pending"
                }
            },

            // ✅ BILLING RANGE
            ...(billingMonthRange > 0 ? [{
                $addFields: {
                    filteredMrvDetails: {
                        $filter: {
                            input: "$mrvDetails",
                            as: "mrv",
                            cond: {
                                $gte: [
                                    "$$mrv.billingDate",
                                    (() => {
                                        const date = new Date();
                                        date.setMonth(date.getMonth() - billingMonthRange);
                                        return date;
                                    })()
                                ]
                            }
                        }
                    }
                }
            }] : [{
                $addFields: {
                    filteredMrvDetails: "$mrvDetails"
                }
            }]),

            ...(billingMonthRange > 0 ? [{
                $match: {
                    "filteredMrvDetails.0": { $exists: true }
                }
            }] : []),

            ...(billNo ? [{
                $addFields: {
                    filteredMrvDetails: {
                        $filter: {
                            input: "$filteredMrvDetails",
                            as: "mrv",
                            cond: {
                                $regexMatch: {
                                    input: { $toString: "$$mrv.billingNo" },
                                    regex: billNo,
                                    options: "i"
                                }
                            }
                        }
                    }
                }
            }, {
                $match: {
                    "filteredMrvDetails.0": { $exists: true }
                }
            }] : []),

            // ✅ FINAL OUTPUT
            {
                $project: {
                    _id: 0,
                    poId: "$_id",
                    poNumber: 1,
                    totalAmount: 1,
                    status: 1,
                    createdAt: 1,
                    poType: 1,
                    requisitionId: "$requestData._id",
                    requisitionNo: "$requestData.requisitionNo",
                    storeName: "$storeData.name",
                    supplierName: "$supplierData.name",
                    supplierId: "$supplierData._id", // ✅ IMPORTANT FIX
                    advanceRentalAmount: 1,
                    advanceRentalPercent: 1,

                    // 🔥 NEW FIELDS
                    paymentStatus: {
                        $ifNull: ["$paymentData.status", "New"]
                    },
                    billingRemarks: "$paymentData.billingApproval.remarks",
                    hoRemarks: "$paymentData.hoApproval.remarks",
                    accountsRemarks: "$paymentData.accountsApproval.remarks",

                    mrvDetails: {
                        $map: {
                            input: "$filteredMrvDetails",
                            as: "m",
                            in: {
                                mrvId: "$$m._id",
                                mrvNo: "$$m.mrvNo",
                                billingNo: "$$m.billingNo",
                                billingTitle: "$$m.billingTitle",
                                billingDate: "$$m.billingDate",
                                image: "$$m.image",
                                totalAmount: "$$m.totalAmount",
                                otherCharges: "$$m.otherCharges"
                            }
                        }
                    }
                }
            },

            {
                $sort: {
                    createdAt: -1
                }
            }

        ]).allowDiskUse(true);

        res.status(200).json({
            status: "success",
            results: data.length,
            data
        });

    } catch (error) {
        console.error(error);

        res.status(500).json({
            status: "error",
            message: "Something went wrong"
        });
    }
};

//show in for billing departmnet

exports.getBillingTableData = async (req, res) => {
    try {

        let {
            poNumber,
            supplier,
            store,
            amount,
            amountCriteria,
            billNo,
            createdMonthRange,
            billingMonthRange,
            viewType,

        } = req.body;

        if (supplier && !Array.isArray(supplier)) {
            supplier = [supplier];
        }

        let matchStage = {};

        if (!viewType || viewType === "new" || viewType === "sentBack") {
            matchStage.status = "Order-Received";
        }

        if (poNumber) {
            matchStage.poNumber = poNumber.trim();
        }

        if (amount && amountCriteria) {
            const operatorMap = {
                gt: "$gt",
                lt: "$lt",
                gte: "$gte",
                lte: "$lte",
                eq: "$eq"
            };

            matchStage.totalAmount = {
                [operatorMap[amountCriteria]]: Number(amount)
            };
        }

        if (createdMonthRange > 0) {
            const from = new Date();
            from.setMonth(from.getMonth() - createdMonthRange);

            matchStage.createdAt = {
                $gte: from
            };
        }

        const data = await PurchaseOrder.aggregate([

            { $match: matchStage },

            {
                $project: {
                    poNumber: 1,
                    totalAmount: 1,
                    status: 1,
                    createdAt: 1,
                    requisitionNo: 1,
                    poType: 1,
                    advanceRentalAmount: 1,
                    advanceRentalPercent: 1,
                    supplierIds: "$items.supplier",
                    supplierId: {
                        $arrayElemAt: ["$items.supplier", 0]
                    }
                }
            },

            // ✅ ITEMS LOOKUP
            {
                $lookup: {
                    from: "items",
                    localField: "_id",
                    foreignField: "po",
                    as: "itemData"
                }
            },

            // 🔥 ✅ ADD ONLY THIS BLOCK (NO IMPACT ANYWHERE)
            {
                $addFields: {
                    failedSupplyCount: {
                        $size: {
                            $filter: {
                                input: "$itemData",
                                as: "item",
                                cond: {
                                    $eq: ["$$item.status", "supplier_failed"]
                                }
                            }
                        }
                    }
                }
            },

            {
                $lookup: {
                    from: "suppliersdetails",
                    localField: "supplierId",
                    foreignField: "_id",
                    as: "supplierData"
                }
            },
            {
                $unwind: {
                    path: "$supplierData",
                    preserveNullAndEmptyArrays: true
                }
            },

            ...(supplier && supplier.length ? [{
                $match: {
                    supplierIds: {
                        $elemMatch: {
                            $in: supplier.map(id => new mongoose.Types.ObjectId(id))
                        }
                    }
                }
            }] : []),

            {
                $lookup: {
                    from: "requests",
                    localField: "requisitionNo",
                    foreignField: "_id",
                    as: "requestData"
                }
            },
            {
                $unwind: {
                    path: "$requestData",
                    preserveNullAndEmptyArrays: true
                }
            },

            {
                $lookup: {
                    from: "stores",
                    localField: "requestData.store",
                    foreignField: "_id",
                    as: "storeData"
                }
            },
            {
                $unwind: {
                    path: "$storeData",
                    preserveNullAndEmptyArrays: true
                }
            },

            ...(store ? [{
                $match: {
                    "storeData._id": new mongoose.Types.ObjectId(store)
                }
            }] : []),

            {
                $lookup: {
                    from: "mrvs",
                    localField: "itemData.mrv",
                    foreignField: "_id",
                    as: "mrvDetails"
                }
            },

            {
                $lookup: {
                    from: "paymentworkflows",
                    localField: "_id",
                    foreignField: "po",
                    as: "paymentData"
                }
            },
            {
                $unwind: {
                    path: "$paymentData",
                    preserveNullAndEmptyArrays: true
                }
            },

            ...(viewType === "accounts" ? [{
                $match: {
                    paymentData: { $ne: null },
                    "paymentData.status": {
                        $in: [
                            "Accounts Pending",
                            "Sent Back by Accounts"
                        ]
                    }
                }
            }] : []),

            ...(viewType === "poPending" ? [{
                $match: {
                    paymentData: { $ne: null },
                    "paymentData.status": "PO Pending"
                }
            }] : []),

            ...(viewType === "poApproved" ? [{
                $match: {
                    "paymentData.status": "HO Pending"
                }
            }] : []),

            ...(viewType === "poSentBack" ? [{
                $match: {
                    "paymentData.status": "Sent Back to Billing",
                    "paymentData.poApproval.status": "Sent Back"
                }
            }] : []),

            ...(viewType === "hoPending" ? [{
                $match: {
                    paymentData: { $ne: null },
                    "paymentData.status": "HO Pending"
                }
            }] : []),

            ...(viewType === "hoApproved" ? [{
                $match: {
                    "paymentData.status": "Accounts Pending"
                }
            }] : []),

            ...(viewType === "hoSentBack" ? [{
                $match: {
                    "paymentData.status": "Sent Back to Billing",
                    "paymentData.hoApproval.status": "Sent Back"
                }
            }] : []),

            ...(viewType === "accountsSentBack" ? [{
                $match: {
                    "paymentData.status": "Sent Back by Accounts"
                }
            }] : []),

            {
                $project: {
                    _id: 0,

                    poId: "$_id",
                    poNumber: 1,
                    totalAmount: 1,
                    status: 1,
                    createdAt: 1,
                    poType: 1,

                    requisitionId: "$requestData._id",
                    requisitionNo: "$requestData.requisitionNo",
                    storeName: "$storeData.name",

                    supplierName: "$supplierData.name",
                    supplierId: "$supplierData._id",

                    paymentId: "$paymentData._id",

                    paymentStatus: {
                        $ifNull: ["$paymentData.status", "New"]
                    },

                    advanceRentalAmount: "$advanceRentalAmount",
                    advanceRentalPercent: "$advanceRentalPercent",

                    // 🔥 ADD THIS IN OUTPUT
                    failedSupplyCount: 1,

                    billingDetails: {
                        approvedAmount: "$paymentData.approvedAmount",
                        totalBillAmount: "$paymentData.totalBillAmount",
                        totalOtherCharges: "$paymentData.totalOtherCharges",

                        creditAmount: "$paymentData.creditNote.amount",
                        creditFile: "$paymentData.creditNote.file",

                        otherDocument: "$paymentData.otherDocument",

                        remarks: "$paymentData.billingApproval.remarks",
                        approvedAt: "$paymentData.billingApproval.approvedAt",
                        approvedBy: "$paymentData.billingApproval.approvedBy"
                    },

                    poDetails: {
                        status: "$paymentData.poApproval.status",
                        remarks: "$paymentData.poApproval.remarks",
                        approvedAt: "$paymentData.poApproval.approvedAt",
                        approvedBy: "$paymentData.poApproval.approvedBy"
                    },

                    billingRemarks: "$paymentData.billingApproval.remarks",

                    poStatus: "$paymentData.poApproval.status",
                    poRemarks: "$paymentData.poApproval.remarks",

                    hoStatus: "$paymentData.hoApproval.status",
                    hoRemarks: "$paymentData.hoApproval.remarks",

                    accountsStatus: "$paymentData.accountsApproval.status",
                    accountsRemarks: "$paymentData.accountsApproval.remarks",

                    accountsDetails: {
                        status: "$paymentData.accountsApproval.status",
                        paidAmount: "$paymentData.accountsApproval.paidAmount",
                        paymentDate: "$paymentData.accountsApproval.paymentDate",
                        paymentMode: "$paymentData.accountsApproval.paymentMode",
                        transactionId: "$paymentData.accountsApproval.transactionId"
                    },

                    mrvDetails: "$mrvDetails"
                }
            },

            { $sort: { createdAt: -1 } }

        ]).allowDiskUse(true);

        res.status(200).json({
            status: "success",
            results: data.length,
            data
        });

    } catch (error) {
        console.error(error);

        res.status(500).json({
            status: "error",
            message: "Something went wrong"
        });
    }
};



exports.getItemsByMrvIds = async (req, res) => {
    try {
        const { mrvIds } = req.body;

        if (!mrvIds || !Array.isArray(mrvIds) || mrvIds.length === 0) {
            return res.status(400).json({
                status: "fail",
                message: "Provide mrvIds array"
            });
        }

        // ✅ PARALLEL FETCH (FASTER)
        const [mrvs, items] = await Promise.all([

            MRV.find({ _id: { $in: mrvIds } })
                .populate("store", "name storeCode")
                .populate("user", "name")
                .populate("supplier", "name")
                .lean(),

            Item.find({ mrv: { $in: mrvIds } })
                .select(`
          inventory qtyRequired approveQty qtyRecived status po mrv 
          damageQty approvedByAdmin approvedBySuperAdmin approvedByBoss
        `)
                .populate({
                    path: "inventory",
                    select: "masterItem",
                    populate: {
                        path: "masterItem",
                        select: "partNo description unit",
                        populate: {
                            path: "unit",
                            select: "name"
                        }
                    }
                })
                .populate("po", "poNumber")
                .populate("approvedByAdmin", "name")
                .populate("approvedBySuperAdmin", "name")
                .populate("approvedByBoss", "name")
                .lean()
        ]);

        // 🔥 STEP 3: CREATE FAST LOOKUP MAP
        const itemMap = {};

        for (const item of items) {
            if (!item.mrv) continue;

            const mrvId = String(
                typeof item.mrv === "object" ? item.mrv._id : item.mrv
            );

            if (!itemMap[mrvId]) itemMap[mrvId] = [];

            itemMap[mrvId].push(item);
        }

        // 🔥 STEP 4: MAP MRV + ITEMS (FAST)
        const result = mrvs.map(mrv => {

            const relatedItems = itemMap[String(mrv._id)] || [];

            const formattedItems = relatedItems.map(item => ({
                partNo: item.inventory?.masterItem?.partNo || "-",
                description: item.inventory?.masterItem?.description || "-",
                unit: item.inventory?.masterItem?.unit?.name || "-",

                qtyRequired: item.qtyRequired || 0,
                approveQty: item.approveQty || 0,
                qtyRecived: item.qtyRecived || 0,
                damageQty: item.damageQty || 0,

                poNumber: item.po?.poNumber || "-",
                status: item.status || "-",

                approvedByAdmin: item.approvedByAdmin?.name || "-",
                approvedBySuperAdmin: item.approvedBySuperAdmin?.name || "-",
                approvedByBoss: item.approvedByBoss?.name || "-"
            }));

            return {
                ...mrv,
                items: formattedItems
            };
        });

        res.status(200).json({
            status: "success",
            data: result
        });

    } catch (err) {
        console.error("getItemsByMrvIds Error:", err);

        res.status(500).json({
            status: "error",
            message: "Failed to fetch MRV data"
        });
    }
};


exports.getItemsByRequisitionId = async (req, res) => {
    try {
        const { requisitionId } = req.body;

        // ✅ VALIDATION
        if (!requisitionId) {
            return res.status(400).json({
                status: "fail",
                message: "Provide requisitionId"
            });
        }

        if (!mongoose.Types.ObjectId.isValid(requisitionId)) {
            return res.status(400).json({
                status: "fail",
                message: "Invalid requisitionId"
            });
        }

        // ✅ STEP 1: FETCH REQUISITION
        const request = await Request.findById(requisitionId)
            .setOptions({ skipPopulate: true })
            .populate({ path: "store", select: "name storeCode" })
            .populate({ path: "user", select: "name" })
            .lean();

        if (!request) {
            return res.status(404).json({
                status: "fail",
                message: "Requisition not found"
            });
        }

        // ✅ STEP 2: FETCH ITEMS (WITH PO + APPROVALS)
        const items = await Item.find({ requisitionNo: requisitionId })
            .setOptions({ skipPopulate: true })
            .select(`
        inventory qtyRequired approveQty qtyRecived 
        po status 
        approvedByAdmin approvedBySuperAdmin approvedByBoss
        adminApprovedAt superAdminApprovedAt bossApprovedAt
      `)
            .populate({
                path: "inventory",
                select: "masterItem",
                populate: {
                    path: "masterItem",
                    select: "partNo description unit",
                    populate: {
                        path: "unit",
                        select: "name"
                    }
                }
            })
            .populate({
                path: "po",
                select: "poNumber status" // ✅ ADD STATUS
            })
            .populate({
                path: "approvedByAdmin",
                select: "name"
            })
            .populate({
                path: "approvedBySuperAdmin",
                select: "name"
            })
            .populate({
                path: "approvedByBoss",
                select: "name"
            })
            .lean();

        // ✅ STEP 3: FORMAT ITEMS
        const formattedItems = items.map(item => ({
            partNo: item.inventory?.masterItem?.partNo || "-",
            description: item.inventory?.masterItem?.description || "-",
            unit: item.inventory?.masterItem?.unit?.name || "-",

            qtyRequired: item.qtyRequired || 0,
            approveQty: item.approveQty || 0,
            qtyRecived: item.qtyRecived || 0,

            // ✅ PO (ONLY IF EXISTS)
            poNumber: item.po?.poNumber || null,
            poStatus: item.po?.status || null, // ✅ NEW FIELD

            // ✅ STATUS
            status: item.status || "-",

            // ✅ APPROVALS
            approvedByAdmin: item.approvedByAdmin?.name || null,
            adminApprovedAt: item.adminApprovedAt || null,

            approvedBySuperAdmin: item.approvedBySuperAdmin?.name || null,
            superAdminApprovedAt: item.superAdminApprovedAt || null,

            approvedByBoss: item.approvedByBoss?.name || null,
            bossApprovedAt: item.bossApprovedAt || null
        }));

        // ✅ FINAL RESPONSE
        res.status(200).json({
            status: "success",
            data: {
                requisition: {
                    requisitionNo: request.requisitionNo,
                    storeName: request.store?.name,
                    storeCode: request.store?.storeCode,
                    requestedBy: request.user?.name,
                    createdAt: request.createdAt,
                    status: request.status
                },
                items: formattedItems
            }
        });

    } catch (err) {
        console.error("getItemsByRequisitionId Error:", err);

        res.status(500).json({
            status: "error",
            message: "Failed to fetch Requisition data"
        });
    }
};

exports.getAllPOPaymentTableData = async (req, res) => {
    try {

        const page = Number(req.body.page || 1);
        const limit = Number(req.body.limit || 50);
        const skip = (page - 1) * limit;

        let {
            search,
            poNumber,
            supplier,
            store,
            amount,
            amountCriteria,
            billNo,
            createdMonthRange,
            billingMonthRange,
            viewType,
            poStatus
        } = req.body;

        if (supplier && !Array.isArray(supplier)) {
            supplier = [supplier];
        }

        let matchStage = {};



        // OPTIONAL STATUS FILTER
        if (poStatus) {
            matchStage.status = poStatus;
        }

        if (poNumber) {
            matchStage.poNumber = poNumber.trim();
        }

        if (amount && amountCriteria) {
            const operatorMap = {
                gt: "$gt",
                lt: "$lt",
                gte: "$gte",
                lte: "$lte",
                eq: "$eq"
            };

            matchStage.totalAmount = {
                [operatorMap[amountCriteria]]: Number(amount)
            };
        }

        if (createdMonthRange > 0) {
            const from = new Date();
            from.setMonth(from.getMonth() - createdMonthRange);

            matchStage.createdAt = {
                $gte: from
            };
        }

        const basePipeline = [

            { $match: matchStage },

            {
                $project: {
                    poNumber: 1,
                    totalAmount: 1,
                    status: 1,
                    createdAt: 1,
                    requisitionNo: 1,
                    poType: 1,
                    advanceRentalAmount: 1,
                    advanceRentalPercent: 1,
                    supplierIds: "$items.supplier",
                    supplierId: {
                        $arrayElemAt: ["$items.supplier", 0]
                    }
                }
            },

            {
                $lookup: {
                    from: "items",
                    localField: "_id",
                    foreignField: "po",
                    as: "itemData"
                }
            },

            {
                $addFields: {
                    failedSupplyCount: {
                        $size: {
                            $filter: {
                                input: "$itemData",
                                as: "item",
                                cond: {
                                    $eq: ["$$item.status", "supplier_failed"]
                                }
                            }
                        }
                    }
                }
            },

            {
                $lookup: {
                    from: "suppliersdetails",
                    localField: "supplierId",
                    foreignField: "_id",
                    as: "supplierData"
                }
            },

            {
                $unwind: {
                    path: "$supplierData",
                    preserveNullAndEmptyArrays: true
                }
            },

            ...(supplier && supplier.length ? [{
                $match: {
                    supplierIds: {
                        $elemMatch: {
                            $in: supplier.map(
                                id => new mongoose.Types.ObjectId(id)
                            )
                        }
                    }
                }
            }] : []),

            {
                $lookup: {
                    from: "requests",
                    localField: "requisitionNo",
                    foreignField: "_id",
                    as: "requestData"
                }
            },

            {
                $unwind: {
                    path: "$requestData",
                    preserveNullAndEmptyArrays: true
                }
            },

            {
                $lookup: {
                    from: "stores",
                    localField: "requestData.store",
                    foreignField: "_id",
                    as: "storeData"
                }
            },

            {
                $unwind: {
                    path: "$storeData",
                    preserveNullAndEmptyArrays: true
                }
            },

            ...(store ? [{
                $match: {
                    "storeData._id": new mongoose.Types.ObjectId(store)
                }
            }] : []),

            {
                $lookup: {
                    from: "mrvs",
                    localField: "itemData.mrv",
                    foreignField: "_id",
                    as: "mrvDetails"
                }
            },

            {
                $lookup: {
                    from: "paymentworkflows",
                    localField: "_id",
                    foreignField: "po",
                    as: "paymentData"
                }
            },

            {
                $unwind: {
                    path: "$paymentData",
                    preserveNullAndEmptyArrays: true
                }
            },

            ...(search?.trim() ? [{
                $match: {
                    $or: [

                        {
                            poNumber: {
                                $regex: search.trim(),
                                $options: "i"
                            }
                        },

                        {
                            "requestData.requisitionNo": {
                                $regex: search.trim(),
                                $options: "i"
                            }
                        },

                        {
                            "supplierData.name": {
                                $regex: search.trim(),
                                $options: "i"
                            }
                        },

                        {
                            "storeData.name": {
                                $regex: search.trim(),
                                $options: "i"
                            }
                        },

                        {
                            "mrvDetails.billingNo": {
                                $regex: search.trim(),
                                $options: "i"
                            }
                        },

                        {
                            "mrvDetails.mrvNo": {
                                $regex: search.trim(),
                                $options: "i"
                            }
                        }
                    ]
                }
            }] : []),

            ...(viewType === "accounts" ? [{
                $match: {
                    paymentData: { $ne: null },
                    "paymentData.status": {
                        $in: [
                            "Accounts Pending",
                            "Sent Back by Accounts"
                        ]
                    }
                }
            }] : []),

            ...(viewType === "hoPending" ? [{
                $match: {
                    paymentData: { $ne: null },
                    "paymentData.status": "HO Pending"
                }
            }] : []),

            ...(viewType === "hoApproved" ? [{
                $match: {
                    "paymentData.status": "Accounts Pending"
                }
            }] : []),

            ...(viewType === "hoSentBack" ? [{
                $match: {
                    $or: [
                        { "paymentData.status": "Sent Back to Billing" },
                        { "paymentData.status": "Sent Back by Accounts" }
                    ]
                }
            }] : [])
        ];

        const data = await PurchaseOrder.aggregate([

            ...basePipeline,

            {
                $project: {
                    _id: 0,

                    poId: "$_id",
                    poNumber: 1,
                    totalAmount: 1,
                    status: 1,
                    createdAt: 1,
                    poType: 1,

                    requisitionId: "$requestData._id",
                    requisitionNo: "$requestData.requisitionNo",
                    storeName: "$storeData.name",

                    supplierName: "$supplierData.name",
                    supplierId: "$supplierData._id",

                    paymentId: "$paymentData._id",

                    paymentStatus: {
                        $ifNull: ["$paymentData.status", "New"]
                    },

                    advanceRentalAmount: 1,
                    advanceRentalPercent: 1,

                    failedSupplyCount: 1,

                    billingDetails: {
                        approvedAmount: "$paymentData.approvedAmount",
                        totalBillAmount: "$paymentData.totalBillAmount",
                        totalOtherCharges: "$paymentData.totalOtherCharges",

                        creditAmount: "$paymentData.creditNote.amount",
                        creditFile: "$paymentData.creditNote.file",

                        otherDocument: "$paymentData.otherDocument",

                        remarks: "$paymentData.billingApproval.remarks",
                        approvedAt: "$paymentData.billingApproval.approvedAt",
                        approvedBy: "$paymentData.billingApproval.approvedBy"
                    },

                    hoRemarks: "$paymentData.hoApproval.remarks",
                    accountsRemarks: "$paymentData.accountsApproval.remarks",

                    accountsDetails: {
                        status: "$paymentData.accountsApproval.status",
                        paidAmount: "$paymentData.accountsApproval.paidAmount",
                        paymentDate: "$paymentData.accountsApproval.paymentDate",
                        paymentMode: "$paymentData.accountsApproval.paymentMode",
                        transactionId:
                            "$paymentData.accountsApproval.transactionId"
                    },

                    mrvDetails: "$mrvDetails"
                }
            },

            { $sort: { createdAt: -1 } },
            { $skip: skip },
            { $limit: limit }

        ]).allowDiskUse(true);

        const countResult = await PurchaseOrder.aggregate([
            ...basePipeline,
            {
                $count: "totalRecords"
            }
        ]);

        const totalRecords =
            countResult.length > 0
                ? countResult[0].totalRecords
                : 0;

        return res.status(200).json({
            status: "success",
            page,
            limit,
            totalRecords,
            totalPages: Math.ceil(totalRecords / limit),
            data
        });

    } catch (error) {
        console.error("getAllPOPaymentTableData Error:", error);

        return res.status(500).json({
            status: "error",
            message: "Something went wrong"
        });
    }
};


