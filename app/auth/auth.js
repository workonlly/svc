const express=require("express");
const router= express.Router();
const db = require("../db/supabase");
const jwt = require("jsonwebtoken")

router.post("/login", async (req, res) => {
    try {
        // 1. Authenticate with Supabase
        const { data: authData, error: authError } = await db.supabase.auth.signInWithPassword({
            email: req.body.email,
            password: req.body.password
        });
        
        if (authError || !authData.user) {
            return res.status(401).json({ message: "Ask for Acess first" });
        }

        // 2. Fetch user details from loggedin table using the id
        const { data, error } = await db.supabase
            .from('loggedin')
            .select('*')
            .eq('id', authData.user.id);
         
        if (error) throw error;

        if (data && data.length > 0) {
            const token = jwt.sign({
                id: data[0].id,
                name: data[0].name,
                email: authData.user.email,
                role: data[0].role
            }, "secretkey", { expiresIn: "1h" });
            
            return res.status(200).json({ message: "User logged in successfully", token, data: data[0] });
        } else {
            return res.status(403).json({ message: "User is not approved for access" });
        }
    } catch (err) {
        console.error(err);
        return res.status(500).json({ message: "Internal server error" });
    }
});



router.post("/signup",async(req,res)=>{
  const {name,email,phonenumber,password}=req.body;
   try{
     const {data,error}= await db.supabase
     .from('person')
     .insert({name,email,mobile:phonenumber,password})
     
     if (error) throw error;
     
     res.status(201).json({message:"User created successfully", data});
   }catch(err){
    console.error(err);
    res.status(500).json({message:"Internal server error"})
   }
})

router.post("/oauth-login", async (req, res) => {
    try {
        const { access_token } = req.body;
        
        // 1. Verify token with Supabase (checks if they are a valid auth.users account)
        const { data: { user }, error } = await db.supabase.auth.getUser(access_token);
        
        // If not found in auth.users or token is invalid, show the access denied popup
        if (error || !user) {
            return res.status(403).json({ message: "Access Denied. You must request access first." });
        }
        
        // 2. Fetch their details from loggedin (this proves if the admin approved them)
        const { data: existingUser } = await db.supabase
            .from('loggedin')
            .select('*')
            .eq('id', user.id);
            
        // 3. If they aren't in the loggedin table, they are NOT approved.
        if (!existingUser || existingUser.length === 0) {
            // Because Supabase automatically adds anyone who clicks Google Login to auth.users,
            // we must cleanly delete them immediately so they don't clutter your Auth dashboard.
            try {
                await db.supabaseAdmin.auth.admin.deleteUser(user.id);
            } catch (delErr) {
                console.error("Failed to clean up unapproved user:", delErr);
            }
            return res.status(403).json({ message: "Access Denied. You must request access first." });
        }
        
        const dbUser = existingUser[0];
        
        // 4. Generate custom JWT
        const token = jwt.sign({
            id: dbUser.id,
            name: dbUser.name,
            email: user.email, // email comes from auth.users, not loggedin table
            role: dbUser.role
        }, "secretkey", { expiresIn: "1h" });
        
        return res.status(200).json({ message: "User logged in via Google successfully", token, data: dbUser });
    } catch (err) {
        console.error("OAuth login error:", err);
        return res.status(500).json({ message: "Internal server error" });
    }
});

module.exports=router;