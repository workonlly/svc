const express = require("express");
const router = express.Router();
const db = require("../db/supabase");
const jwt = require("jsonwebtoken")

router.post("/login", async (req, res) => {
    try {

        const { data: authData, error: authError } = await db.supabase.auth.signInWithPassword({
            email: req.body.email,
            password: req.body.password
        });

        if (authError || !authData.user) {
            return res.status(401).json({ message: "Ask for Acess first" });
        }


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
            }, process.env.JWT_SECRET || "secretkey", { expiresIn: "1h" });

            return res.status(200).json({ message: "User logged in successfully", token, data: data[0] });
        } else {
            return res.status(403).json({ message: "User is not approved for access" });
        }
    } catch (err) {
        console.log(err);
        console.error(err);
        return res.status(500).json({ message: "Internal server error" });
    }
});



router.post("/signup", async (req, res) => {
    const { name, email, phonenumber, password } = req.body;
    try {
        const { data, error } = await db.supabaseAdmin
            .from('person')
            .insert({ name, email, mobile: phonenumber, password })

        if (error) throw error;


        res.status(201).json({ message: "User created successfully", data });

    } catch (err) {
        console.error("Signup error:", err);
        res.status(500).json({ message: err.message || "Internal server error" })
    }
})

router.post("/oauth-login", async (req, res) => {
    try {
        const { access_token } = req.body;


        const { data: { user }, error } = await db.supabase.auth.getUser(access_token);


        if (error || !user) {
            return res.status(403).json({ message: "Access Denied. You must request access first." });
        }


        const { data: existingUser } = await db.supabase
            .from('loggedin')

            .select('*')
            .eq('id', user.id);


        if (!existingUser || existingUser.length === 0) {


            try {
                await db.supabaseAdmin.auth.admin.deleteUser(user.id);
            } catch (delErr) {
                console.error("Failed to clean up unapproved user:", delErr);
            }
            return res.status(403).json({ message: "Access Denied. You must request access first." });
        }

        const dbUser = existingUser[0];


        const token = jwt.sign({

            id: dbUser.id,
            name: dbUser.name,
            email: user.email,

            role: dbUser.role
        }, process.env.JWT_SECRET || "secretkey", { expiresIn: "1h" });

        return res.status(200).json({ message: "User logged in via Google successfully", token, data: dbUser });
    } catch (err) {
        console.error("OAuth login error:", err);
        return res.status(500).json({ message: "Internal server error" });
    }
});

router.get("/google-url", async (req, res) => {
    try {
        const redirectTo = req.query.redirectTo;

        const { data, error } = await db.supabase.auth.signInWithOAuth({

            provider: 'google',

            options: {
                redirectTo: redirectTo
            }
        });

        if (error) throw error;

        return res.status(200).json({ url: data.url });
    } catch (err) {
        console.error("Error generating Google URL:", err);
        return res.status(500).json({ message: "Internal server error" });
    }
});

module.exports = router;