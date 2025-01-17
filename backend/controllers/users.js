const { pool } = require("../models/db");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

const SECRET = process.env.SECRET;
const TOKEN_EXP_Time = process.env.TOKEN_EXP_Time;
const SALT = Number(process.env.SALT);

// creating a token
const generateToken = (rows) => {
  const payload = {
    userId: rows[0].id,
    country: rows[0].country,
    role: rows[0].role,
    role_id: rows[0].role_id,
  };
  const options = {
    expiresIn: TOKEN_EXP_Time,
  };

  return jwt.sign(payload, SECRET, options);
};

// This function creates (new user)
const register = async (req, res) => {
  const { first_name, last_name, age, country, email, password, role_id, img } =
    req.body;
  const loweredMail = email.toLowerCase();
  const query = `INSERT INTO users (first_name,
    last_name,
    age,
    country,
    email,
    password,
    role_id,
    img) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *;`;
  try {
    const hashedPassword = await bcrypt.hash(password, SALT);
    const placeHolders = [
      first_name,
      last_name,
      age,
      country,
      loweredMail,
      hashedPassword,
      role_id,
      img,
    ];
    const { rows } = await pool.query(query, placeHolders);
    if (rows) {
      res.status(201).json({
        success: true,
        message: "Account created successfully",
        rows,
      });
    } else throw Error;
  } catch (err) {
    if (err.code === "23505") {
      return res.status(409).json({
        success: false,
        message: "The email already exists",
      });
    }
    res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
};

const login = async (req, res) => {
  const { email, password } = req.body;
  const query = `SELECT users.id,users.first_name,users.country,users.password,users.email, users.img, roles.role,roles.id as role_id FROM users JOIN roles
  ON users.role_id = roles.id WHERE users.email=$1 ;`;
  const placeHolders = [email.toLowerCase()];
  try {
    const { rows } = await pool.query(query, placeHolders);
    const isValid = await bcrypt.compare(password, rows[0].password);
    if (isValid) {
      const token = generateToken(rows);
      res.status(200).json({
        success: true,
        massage: "Valid login credentials",
        token,
        userId: rows[0].id,
        first_name: rows[0].first_name,
        img: rows[0].img,
        role: rows[0].role,
        rows,
      });
    } else {
      res.status(403).json({
        success: false,
        message:
          "The email doesn’t exist or the password you’ve entered is incorrect",
      });
    }
  } catch (err) {
    res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
};

const getUserById = (req, res) => {
  const { id } = req.params;
  const query = `SELECT 
  u.id, 
  u.first_name, 
  u.last_name, 
  u.age, 
  u.country, 
  u.email, 
  r.role, 
  r.id AS role_id, 
  COUNT(DISTINCT f1.id) AS followers_count, 
  COUNT(DISTINCT f2.id) AS following_count, 
  ARRAY_AGG(p.id) AS posts
FROM users u 
JOIN roles r ON u.role_id = r.id
LEFT JOIN follows f1 ON u.id = f1.followed_user_id AND f1.is_deleted = 0
LEFT JOIN follows f2 ON u.id = f2.following_user_id AND f2.is_deleted = 0
LEFT JOIN posts p ON u.id = p.user_id AND p.is_deleted = 0
WHERE u.id = ($1) AND u.is_deleted = 0
GROUP BY u.id, r.role, r.id`;
  pool
    .query(query, [id])
    .then(({ rows }) => {
      if (rows.length === 0) {
        return res.status(404).json({
          success: false,
          message: `No user with the id: ${id}`,
        });
      }
      res.status(200).json({
        success: true,
        message: `user with the id: ${id}`,
        user: rows[0],
      });
    })
    .catch((err) => {
      res.status(500).json({
        success: false,
        message: "Server error",
        err: err.message,
      });
    });
};

const getAllUsers = (req, res) => {
  const query = `SELECT id, first_name, last_name, age, country, email, created_at, img, is_deleted FROM users WHERE is_deleted=0 ORDER BY created_at DESC`;
  pool
    .query(query)
    .then(({ rows }) => {
      if (rows.length === 0) {
        return res.status(404).json({
          success: false,
          message: `No users found`,
        });
      }
      res.status(200).json({
        success: true,
        message: `all users`,
        users: rows,
      });
    })
    .catch((err) => {
      res.status(500).json({
        success: false,
        message: "Server error",
        err: err.message,
      });
    });
};

const updateUserById = async (req, res) => {
  const { id } = req.params;
  const { first_name, last_name, age, country, email, password, img } =
    req.body;
  const loweredMail = email?.toLowerCase();
  const query = `UPDATE users SET first_name = COALESCE($1,first_name), last_name = COALESCE($2,last_name), age=COALESCE($3,age), country=COALESCE($4,country), email=COALESCE($5,email), password=COALESCE($6,password), img=COALESCE($7,img) WHERE id=$8 RETURNING *`;
  try {
    const placeHolders = [
      first_name || null,
      last_name || null,
      age || null,
      country || null,
      loweredMail || null,
      password ? await bcrypt.hash(password, SALT) : null,
      img || null,
      id,
    ];
    const { rows } = await pool.query(query, placeHolders);
    if (!rows) {
      return res.status(404).json({
        success: false,
        message: `The user with id: ${id} is not found`,
      });
    }
    res.status(201).json({
      success: true,
      message: `User with id: ${id} updated successfully`,
      user: rows[0],
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: "Server error",
      err: err.message,
    });
  }
};

const deleteUser = async (req, res) => {
  const { id } = req.params;
  const query = `UPDATE users SET is_deleted=1 WHERE id=$1 RETURNING *`;
  try {
    const { rows } = await pool.query(query, [id]);
    if (!rows) {
      return res.status(404).json({
        success: false,
        message: `The user with id: ${id} is not found`,
      });
    }
    res.status(201).json({
      success: true,
      message: `User with id: ${id} deleted successfully`,
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: "Server error",
      err: err.message,
    });
  }
};

const searchUsers = async (req, res) => {
  const { name } = req.params;

  const query = `SELECT * FROM users WHERE first_name LIKE $1'%' ;`;
  try {
    const { rows } = await pool.query(query, [name]);
    if (!rows) {
      return res.status(404).json({
        success: false,
        message: `no users user with name: ${name}`,
      });
    }
    res.status(201).json({
      success: true,
      message: `users with the name ${name}`,
      users: rows,
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: "Server error",
      err: err.message,
    });
  }
};

const followUser = (req, res) => {
  const { id } = req.params;
  const userId = req.token.userId;
  const placeHolders = [userId, id];
  const query = `INSERT INTO follows (following_user_id,followed_user_id) VALUES ($1,$2) RETURNING *`;
  pool
    .query(query, placeHolders)
    .then(({ rows }) => {
      if (!rows) {
        return res.status(404).json({
          success: false,
          message: `no users user with id: ${id}`,
        });
      }
      res.status(201).json({
        success: true,
        message: `users with the id ${id} has been followed`,
      });
    })
    .catch((err) => {
      res.status(500).json({
        success: false,
        message: "Server error",
        err: err.message,
      });
    });
};

const unFollowUser = (req, res) => {
  const { id } = req.params;
  const userId = req.token.userId;
  const placeHolders = [userId, id];
  const query = `UPDATE follows SET is_deleted=1 WHERE following_user_id = $1 AND followed_user_id = $2 RETURNING *`;
  pool
    .query(query, placeHolders)
    .then(({ rows }) => {
      if (!rows) {
        return res.status(404).json({
          success: false,
          message: `no users user with id: ${id}`,
        });
      }
      res.status(201).json({
        success: true,
        message: `users with the id ${id} has been unFollowed`,
      });
    })
    .catch((err) => {
      res.status(500).json({
        success: false,
        message: "Server error",
        err: err.message,
      });
    });
};

const getFollowersByUserId = (req, res) => {
  const { id } = req.params;
  const query = `SELECT u.id, u.first_name, u.last_name
  FROM follows f
  INNER JOIN users u ON f.following_user_id = u.id
  WHERE f.followed_user_id = $1 AND f.is_deleted = 0;
  `;
  pool
    .query(query, [id])
    .then(({ rows }) => {
      res.status(201).json({
        success: true,
        message: `users with the id ${id} has been followers`,
        followers: rows,
      });
    })
    .catch((err) => {
      res.status(500).json({
        success: false,
        message: "Server error",
        err: err.message,
      });
    });
};

const getFollowingByUserId = (req, res) => {
  const { id } = req.params;
  const query = `SELECT u.id, u.first_name, u.last_name
  FROM follows f
  INNER JOIN users u ON f.followed_user_id = u.id
  WHERE f.following_user_id = $1 AND f.is_deleted = 0;
  `;
  pool
    .query(query, [id])
    .then(({ rows }) => {
      res.status(201).json({
        success: true,
        message: `users with the id ${id} following`,
        followers: rows,
      });
    })
    .catch((err) => {
      res.status(500).json({
        success: false,
        message: "Server error",
        err: err.message,
      });
    });
};

module.exports = {
  register,
  login,
  getUserById,
  getAllUsers,
  updateUserById,
  deleteUser,
  searchUsers,
  followUser,
  unFollowUser,
  getFollowersByUserId,
  getFollowingByUserId,
};
