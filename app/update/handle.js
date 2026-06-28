const express=require("express")
const router=express.Router()
const auth=require("../middleware/middleware")
const db = require("../db/supabase")

router.put("/update",(req,res)=>{
    
}) 


router.post("/link",auth,async(req,res)=>{
    try{
        const {title,description,url,id}=req.body;
        const {data,error}= await db.supabase
 
        .from('links')
        .update({title,description,url})
     
        .eq('id',id)
        if(error) throw error
     
        res.status(200).json({message:"Link updated successfully", data})
    }catch(err){
      
        console.error(err);
        res.status(500).json({message:"Internal server error"})
    }
})

router.delete("/delete",async (req,res)=>{
    try{
       
        const {id}=req.body;
        const {data,error}= await db.supabase
    

        .from('links')
        .delete()
      
        .eq('id',id)
        if(error) throw error
        res.status(200).json({message:"Link deleted successfully", data})
    }catch(err){
        console.error(err);
     
        res.status(500).json({message:"Internal server error"})
    }
})



router.get('/logged', async (req, res) => {
    try {
        const { data, error } = await db.supabase.from('loggedin').select('*');
     
        if (error) throw error;
    
        res.status(200).json({ message: "Fetched logged in users successfully", data });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: "Internal server error" });
    }
});

router.put("/access", async (req, res) => {
    try {
        const { id, role } = req.body;
        const { data, error } = await db.supabase
            .from('loggedin')
       
            .update({ role })
            .eq('id', id)
        
            .select();
        if (error) throw error;
      
        res.status(200).json({ message: "Role updated successfully", data });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: "Internal server error" });
    }
});

router.delete("/removeuser", async (req, res) => {
    try {
        const { id } = req.body;
        
        
        const { error: loggedInError } = await db.supabase
            .from('loggedin')
       
            .delete()
            .eq('id', id);
        if (loggedInError) throw loggedInError;

        
        const { data, error } = await db.supabaseAdmin.auth.admin.deleteUser(id);
        if (error) throw error;
        
        res.status(200).json({ message: "User deleted successfully", data });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: "Internal server error" });
    }
});

router.post("/contact",async(req,res)=>{
    try{
        const {name,email,title,message}=req.body;
        
        
        const oneMinuteAgo = new Date(Date.now() - 60000).toISOString();
        const { data: recentQuery, error: recentError } = await db.supabase
            .from('contactquery')
            .select('created_at')
            .eq('email', email)
            .gte('created_at', oneMinuteAgo);

        if (recentError) throw recentError;

        if (recentQuery && recentQuery.length > 0) {
            return res.status(429).json({ message: "You have recently sent a message. Please wait for one minute." });
        }

        const {data,error}= await db.supabase
      
        .from('contactquery')
        .insert({name,email,title,message})
      
         if(error) throw error
         res.status(200).json({message:"Contact query sent successfully", data})
    }catch(err){
        console.error(err);
        res.status(500).json({message:"Internal server error"})
    }
})
router.put("/contactput",async(req,res)=>{
    try{
        const {id}=req.body;
       
        const {data,error}= await db.supabase
        .from('contactquery')
      
        .update({checked:true})
      
        .eq('id',id)
          if(error) throw error
         res.status(200).json({message:"Contact query updated successfully", data})
    }
    catch(err){
        console.error(err);
        res.status(500).json({message:"Internal server error"})
    }
})
router.get('/getcontact',async(req,res)=>{
    try{
     
        const {data,error}= await db.supabase
     
         .from('contactquery')
      
          .select()
        if(error) throw error
      
          res.status(200).json({message:"Contact query fetched successfully", data})
    }catch(err){
        console.error(err);
        res.status(500).json({message:"Internal server error"})
    }
})



module.exports=router