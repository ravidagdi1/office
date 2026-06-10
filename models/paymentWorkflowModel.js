const mongoose = require("mongoose");

const paymentWorkflowSchema = new mongoose.Schema({

    // =========================
    // 🔥 CORE REFERENCES
    // =========================
    po: {
        type: mongoose.Schema.ObjectId,
        ref: "PurchaseOrder",
        required: true
    },

    mrvIds: [
        {
            type: mongoose.Schema.ObjectId,
            ref: "Mrv"
        }
    ],

    supplier: {
        type: mongoose.Schema.ObjectId,
        ref: "SuppliersDetails",
        required: true
    },

    // =========================
    // 🔥 AMOUNTS SUMMARY
    // =========================
    totalPoAmount: {
        type: Number,
        default: 0
    },

    totalBillAmount: {
        type: Number,
        default: 0
    },

    totalOtherCharges: {
        type: Number,
        default: 0
    },

    approvedAmount: {
        type: Number,
        default: 0
    },

    // =========================
    // 🔥 CREDIT NOTE
    // =========================
    creditNote: {
        isApplied: {
            type: Boolean,
            default: false
        },
        file: String,
        amount: {
            type: Number,
            default: 0
        }
    },

    // =========================
    // 🔥 OTHER DOCUMENT
    // =========================
    otherDocument: {
        type: String
    },

    // =========================
    // 🔥 LEVEL 1 → BILLING TEAM
    // =========================
    billingApproval: {
        approvedBy: {
            type: mongoose.Schema.ObjectId,
            ref: "User"
        },
        remarks: String,
        approvedAt: Date
    },

    // =========================
    // 🔥 NEW LEVEL → PO APPROVAL
    // Procurement-Accounts Team
    // =========================
    poApproval: {
        status: {
            type: String,
            enum: ["Pending", "Approved", "Sent Back"],
            default: "Pending"
        },
        approvedBy: {
            type: mongoose.Schema.ObjectId,
            ref: "User"
        },
        remarks: String,
        approvedAt: Date
    },

    // =========================
    // 🔥 LEVEL 2 → HO APPROVAL
    // =========================
    hoApproval: {
        status: {
            type: String,
            enum: ["Pending", "Approved", "Rejected", "Sent Back"],
            default: "Pending"
        },
        approvedBy: {
            type: mongoose.Schema.ObjectId,
            ref: "User"
        },
        remarks: String,
        approvedAt: Date
    },

    // =========================
    // 🔥 LEVEL 3 → ACCOUNTS
    // =========================
    accountsApproval: {
        status: {
            type: String,
            enum: ["Pending", "Paid", "Rejected", "Sent Back"],
            default: "Pending"
        },
        paidAmount: {
            type: Number,
            default: 0
        },
        paymentDate: Date,
        paymentMode: String,
        transactionId: String,
        remarks: String,
        approvedBy: {
            type: mongoose.Schema.ObjectId,
            ref: "User"
        }
    },

    // =========================
    // 🔥 GLOBAL STATUS
    // =========================
    status: {
        type: String,
        enum: [
            "Billing Approved",

            // NEW
            "PO Pending",
            "PO Approved",

            "HO Pending",
            "Sent Back to Billing",
            "HO Approved",
            "Accounts Pending",
            "Paid",
            "Rejected",
            "Sent Back by Accounts"
        ],
        default: "Billing Approved"
    },

    // =========================
    // 🔥 OPTIONAL AUDIT TRAIL
    // =========================
    history: [
        {
            action: String,

            by: {
                type: mongoose.Schema.ObjectId,
                ref: "User"
            },

            role: {
                type: String,
                enum: ["billing", "po", "director", "accounts"],
                default: "billing"
            },

            remarks: String,

            date: {
                type: Date,
                default: Date.now
            }
        }
    ]

}, {
    timestamps: true
});

module.exports = mongoose.model("PaymentWorkflow", paymentWorkflowSchema);