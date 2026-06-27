const express = require("express");
const router = express.Router();
const { supabaseAdmin } = require("../db/supabase");

router.get("/data", async (req, res) => {
    const startdefault = req.query.person || "Areeb";

    try {
        // 1. Get the starting person
        const { data: rootPerson } = await supabaseAdmin
            .from("individuals")
            .select("*")
            .or(`id.eq.${startdefault},given_names.eq.${startdefault}`)
            .limit(1)
            .single();

        if (!rootPerson) return res.status(404).json({ error: "Person not found" });

        // 2. Setup the "Bubbling" Arrays
        const queue = [rootPerson.id]; // The array we iterate through
        const result = [rootPerson];   // The final list of people to send to the frontend
        const seenIds = new Set([rootPerson.id]); // Keeps track so we don't infinite loop
        const allFamilyIds = new Set(); // Keep track of all family connections

        // 3. The Queue Loop (Stops when we hit 30 people or run out of connections)
        let i = 0;
        while (i < queue.length && result.length < 30) {
            const currentId = queue[i]; // Grab the current person

            // Fetch all their relatives
            const { profiles, relatedFamilyIds } = await fetchAllConnections(currentId);

            if (relatedFamilyIds) {
                relatedFamilyIds.forEach(id => allFamilyIds.add(id));
            }

            // Loop through the new relatives
            for (const relative of profiles) {
                // If we haven't seen them yet, and we are under the 30 person limit
                if (!seenIds.has(relative.id) && result.length < 30) {
                    seenIds.add(relative.id);      // Mark as seen
                    result.push(relative);         // Save to final output
                    queue.push(relative.id);       // Push to the back of the queue!
                }
            }

            i++; // Move to the next person in the queue
        }

        let families = [];
        let family_children = [];

        if (allFamilyIds.size > 0) {
            const { data: fData } = await supabaseAdmin.from("families").select("*").in("id", Array.from(allFamilyIds));
            if (fData) families = fData;

            const { data: fcData } = await supabaseAdmin.from("family_children").select("*").in("family_id", Array.from(allFamilyIds));
            if (fcData) family_children = fcData;
        }

        // Fetch any missing individuals that are part of these families!
        const missingIds = new Set();
        families.forEach(f => {
            if (f.husband_id && !seenIds.has(f.husband_id)) missingIds.add(f.husband_id);
            if (f.wife_id && !seenIds.has(f.wife_id)) missingIds.add(f.wife_id);
        });
        family_children.forEach(fc => {
            if (fc.child_id && !seenIds.has(fc.child_id)) missingIds.add(fc.child_id);
        });

        if (missingIds.size > 0) {
            const { data: missingProfiles } = await supabaseAdmin.from("individuals").select("*").in("id", Array.from(missingIds));
            if (missingProfiles) {
                missingProfiles.forEach(p => {
                    result.push(p);
                    seenIds.add(p.id);
                });
            }
        }

        // Send the flat array of 30 people back
        res.json({
            count: result.length,
            individuals: result,
            families,
            family_children,
            startPersonId: rootPerson.id,
            expandableIds: [] // disable expandable nodes for now since we cap at 30
        });

    } catch (err) {
        console.error("Error in queue route:", err.message);
        res.status(500).json({ error: "Failed to fetch data", details: err.message });
    }
});

async function fetchAllConnections(id) {
    try {
        // 1. Where they are a child (Finds Parents & Siblings)
        const { data: asChild } = await supabaseAdmin.from("family_children").select("family_id").eq("child_id", id);

        // 2. Where they are a spouse (Finds Spouses & their Children)
        const { data: asSpouse } = await supabaseAdmin.from("families").select("id").or(`husband_id.eq.${id},wife_id.eq.${id}`);

        const familyIds = [
            ...(asChild ? asChild.map(f => f.family_id) : []),
            ...(asSpouse ? asSpouse.map(f => f.id) : [])
        ];

        if (familyIds.length === 0) return { profiles: [], relatedFamilyIds: [] };

        // 3. Get all people attached to these families
        const { data: families } = await supabaseAdmin.from("families").select("husband_id, wife_id").in("id", familyIds);
        const { data: children } = await supabaseAdmin.from("family_children").select("child_id").in("family_id", familyIds);

        const connectedIds = new Set();
        if (families) {
            families.forEach(f => {
                if (f.husband_id) connectedIds.add(f.husband_id);
                if (f.wife_id) connectedIds.add(f.wife_id);
            });
        }
        if (children) {
            children.forEach(c => connectedIds.add(c.child_id));
        }

        // Remove the original person from the results so we don't fetch them again
        connectedIds.delete(id);

        // Fetch their profiles
        const { data: profiles } = await supabaseAdmin.from("individuals").select("*").in("id", Array.from(connectedIds));
        return { profiles: profiles || [], relatedFamilyIds: familyIds };
    } catch (err) {
        console.error("Error fetching connections:", err.message);
        return { profiles: [], relatedFamilyIds: [] };
    }
}

module.exports = router;