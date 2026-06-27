const express = require("express")
const router = express.Router()
const db = require("../db/supabase")

router.post("/post", async(req, res) => {
    try{
        const { id, name, email, mobile, password } = req.body;
        
        const { data: authData, error: authError } = await db.supabaseAdmin.auth.admin.createUser({
            email: email,
            password: password,
            phone: mobile,
            user_metadata: {
                display_name: name
            },
            email_confirm: true,
            phone_confirm: true
        });

        if(authError){
            return res.status(400).json({message: authError.message})
        }
        
        const newUserId = authData.user?.id;
        if (!newUserId) {
            return res.status(500).json({message: "Failed to create user"})
        }

        // 2. Insert into loggedin table
        const { error: insertError } = await db.supabase
            .from("loggedin")
            .insert({
                id: newUserId,
                name: name,
                mobile: mobile,
                password:password,
                role: 'user'
            });

        if(insertError){
            console.error("Insert error:", insertError);
            return res.status(500).json({message:"Error inserting into loggedin table"})
        }
        
 
        const { error: deleteError } = await db.supabase
            .from("person")
            .delete()
            .eq("id", id);
            
        if(deleteError){
            return res.status(500).json({message:"Error deleting from person table"})
        }

        res.status(200).json({ message: "User accepted successfully" })
    }catch(err){
        console.error(err)
        res.status(500).json({message:"Internal server error"})
    }
})

router.delete('/delete',async(req,res)=>{
    try{
        const {data,error}= await db.supabase
        .from("person")
        .delete()
        .eq("id",req.body.id)
        .select()
        if(error){
            return res.status(500).json({message:"Internal server error"})
        }
        res.status(200).json({data})

    }catch(err){
        console.error(err)
        res.status(500).json({message:"Internal server error"})
    }
})

router.get("/", async(req, res) => {
 try{
    const {data,error}=await db.supabase    
    .from("person")
    .select("*")

    if(error){
        return res.status(500).json({message:"Internal server error"})
    }
    res.status(200).json({data})
 }catch(err){
    console.log(err)
    res.status(500).json({message:"Internal server error"})
 }

})

module.exports = router