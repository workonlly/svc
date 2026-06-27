const express = require('express')
const router = express.Router()

router.get("/", (req, res) => {
    res.send("Link Page");
});

router.put("/update",(req,res)=>{
    
    
})

router.post("/generatelink", (req, res) => {


})

module.exports = router