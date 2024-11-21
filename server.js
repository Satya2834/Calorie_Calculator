const express = require('express');
const session = require('express-session');
const path = require('path');
const { MongoClient } = require("mongodb");
const bcrypt = require('bcryptjs');
require('dotenv').config();

const app = express();
const port = 3000;

// Middleware to serve static files
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// Setup session middleware
app.use(session({
  secret: process.env.SECRET_KEY,
  resave: false,
  saveUninitialized: true
}));

// MongoDB Connection
const uri = process.env.MONGO_URI;
const client = new MongoClient(uri);

async function connectDB() {
  try {
    await client.connect();
    console.log('Connected to MongoDB');
  } catch (err) {
    console.error('MongoDB connection error', err);
  }
}

connectDB();

// Register route (GET)
app.get('/register', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'register.html'));
});

// Register route (POST)
app.post('/register', async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.send('Username and password are required');
  }

  const usersCollection = client.db(process.env.DB_NAME).collection("users"); 
  const existingUser = await usersCollection.findOne({ username: username });
  if (existingUser) {
    return res.send('Username already exists');
  }

  const hashedPassword = await bcrypt.hash(password, 10);
  const newUser = {
    username: username,
    password: hashedPassword
  };

  await usersCollection.insertOne(newUser);
  res.send('Registration successful! You can now <a href="/login">login</a>');
});


// Login route (GET)
app.get('/', (req, res) => {
  if (req.session.loggedIn) {
    return res.redirect('/calorie_cal.html');
  }
  res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

app.get('/login', (req, res) => {
  if (req.session.loggedIn) {
    return res.redirect('/calorie_cal.html');
  }
  res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

// Login POST route
app.post('/login', async (req, res) => {
  const { username, password } = req.body;

  const usersCollection = client.db(process.env.DB_NAME).collection("users");  // Use DB_NAME from .env
  
  // Find user by username
  const user = await usersCollection.findOne({ username: username });
  if (!user) {
    return res.send('Invalid credentials');
  }

  // Compare password with hashed password
  const passwordMatch = await bcrypt.compare(password, user.password);
  if (passwordMatch) {
    req.session.loggedIn = true;
    req.session.username = username;
    return res.redirect('/calorie_cal.html');
  } else {
    return res.send('Invalid credentials');
  }
});

// send username
app.get('/getUsername', (req, res) => {
  if (req.session.loggedIn) {
    return res.json({ username: req.session.username });
  }
  res.status(401).send('Not logged in');
});

// Calculator route (only accessible if logged in)
app.get('/calorie_cal.html', (req, res) => {
  if (!req.session.loggedIn) {
    return res.redirect('/login');
  }
  res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

app.post('/storeCalorieData', async (req, res) => {
  let response = "";
  const {data, totCalories} = req.body;
  const username = req.session.username;
  console.log("storeCalorieData0: ", data, totCalories);
  if (!data || !totCalories) {
    return res.status(400).send('Missing required fields');
  }

  try {
    const calorieDataCollection = client.db(process.env.DB_NAME).collection(username);
    const currentDate = new Date().toLocaleDateString();
    console.log("storeCalorieData1: ", {[currentDate]: data});
    await calorieDataCollection.updateOne(
      { [currentDate]: { $exists: true } },
      { $set: { [currentDate]: JSON.stringify(data) } },
      { upsert: true }
    );
    response += '(200) Calorie data stored successfully';
  } catch (err) {
    console.error('Error storing calorie data:', err);
    response += '(500) Failed to store calorie data';
  }

  try {
    const currentDate = new Date().toLocaleDateString();
    const graphDataCollection = client.db(process.env.DB_NAME).collection(username+"graphData");
    console.log("storeCalorieData2: " ,{[currentDate]: data});
    await graphDataCollection.updateOne(
      { [currentDate]: { $exists: true } },
      { $set: { [currentDate]: totCalories } },
      { upsert: true }
    );
    response += '(200) Graph data stored successfully';
  } catch (err) {
    console.error('Error storing graph data:', err);
    response += '(500) Failed to store graph data';
  }
  res.send(response);
});

app.post('/retrieveCalorieData', async (req, res) => {
  const username = req.session.username;
  const date = req.body;
  const calorieDataCollection = client.db(process.env.DB_NAME).collection(username);

  try {
    const calorieData = await calorieDataCollection.findOne({date}).toArray();
    console.log("retrieveCalorieData ", calorieData);
    res.status(200).json(calorieData);
  } catch (err) {
    console.error('Error storing calorie data:', err);
    res.status(500).send('Failed to store calorie data');
  }
});

app.post('/retrieveGraphData', async (req, res) => {
  const username = req.session.username;
  const graphDataCollection = client.db(process.env.DB_NAME).collection(username+"graphData");

  try {
    const graphData = await graphDataCollection.find().toArray();
    console.log("retrieveGraphData ", graphData);
    res.status(200).json(graphData);
  } catch (err) {
    console.error('Error storing calorie data:', err);
    res.status(500).send('Failed to store calorie data');
  }
});

// Logout route
app.get('/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      return res.send('Error logging out');
    }
    res.redirect('/login');
  });
});

app.listen(port, () => {
  console.log(`App is running at http://localhost:${port}`);
});
