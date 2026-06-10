
const Category = require('../models/categoryModel');
const factory = require('./handlerFactory');


exports.createCategory = factory.createOne(Category)

exports.getCategoryById = factory.getOne(Category);
exports.getAllCategory = factory.getAll(Category);

exports.updateCategoryById = factory.updateOne(Category);
exports.deleteCategoryById = factory.deleteOne(Category);
