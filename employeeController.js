const firebase = require("../db");
const Employee = require("../employee");
const fireStore = firebase.firestore();

// performing crud operations in the firebase firestore
// add
// get all
// get
// update
// delete

const addEmployee = async (req, res, next) => {
  try {
    console.log("Adding new employee");
    const data = req.body;
    await fireStore.collection("employees").doc().set(data);
    res.status(201).json({ message: "Record saved successfully" });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

const getAllEmployees = async (req, res, next) => {
  try {
    console.log("Getting all employees");
    const employees = await fireStore.collection("employees");
    const data = await employees.get();
    const arr = [];
    if (data.empty) {
      res.status(200).json({ message: "No records found" });
    } else {
      let total = 0;
      data.forEach((item) => {
        const employee = new Employee(
          item.id,
          item.data().fullName,
          item.data().age,
          item.data().contact,
          item.data().department
        );
        arr.push(employee);
        total = total + 1;
      });
      res.status(200).json({
        listing: arr,
        count: total
      });
    }
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

const getEmployee = async (req, res, next) => {
  try {
    const id = req.params.id;
    console.log("Getting employee= %s", id);
    const employee = await fireStore.collection("employees").doc(id);
    const data = await employee.get();
    if (!data.exists) {
      res.status(404).json({ message: "Record not found" });
    } else {
      res.status(200).json(data.data());
    }
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

const updateEmployee = async (req, res, next) => {
  try {
    const id = req.params.id;
    console.log("Updating employee= %s", id);
    const data = req.body;
    const employee = await fireStore.collection("employees").doc(id);
    await employee.update(data);
    res.status(204).json({ message: "Record updated successfully" });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

const deleteEmployee = async (req, res, next) => {
  try {
    const id = req.params.id;
    console.log("Deleting employee= %s", id);
    await fireStore.collection("employees").doc(id).delete();
    res.status(204).json({ message: "Record deleted successfully" });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

// todo - add delete all employees

module.exports = {
  addEmployee,
  getAllEmployees,
  getEmployee,
  updateEmployee,
  deleteEmployee
};