const jwt = require('jsonwebtoken');

const verifyToken = async (req, res, next) => {
    try {

        const authHeader = req.headers.authorization;
        
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ message: "Access Denied: No token provided." });
        }

        const token = authHeader.split(' ')[1];

     
        const decoded = jwt.verify(token, process.env.JWT_SECRET || "secretkey");

      
        req.user = decoded;

 
        next();

    } catch (error) {
    
        return res.status(403).json({ message: "Invalid or expired token." });
    }
};

module.exports = verifyToken;