const express = require("express");
const router = express.Router();
const { drive } = require("../db/doogledrive");
const { supabaseAdmin: supabase } = require("../db/supabase");
const parseGedcom = require("parse-gedcom");

const MAIN_FOLDER = process.env.NEXT_PUBLIC_MAIN_FOLDER;
const PROFILE_PHOTOS = process.env.NEXT_PUBLIC_PROFILE_PHOTOS;
const LITERACY_WORKS = process.env.NEXT_PUBLIC_LITERACY_WORKS;
const HISTORICAL_DOCS = process.env.NEXT_PUBLIC_HISTORICAL_DOCS;


const chunkArray = (arr, size) => 
    Array.from({ length: Math.ceil(arr.length / size) }, (v, i) => arr.slice(i * size, i * size + size));

router.put("/puting", async (req, res) => {
    try {
        console.log("Starting Gedcom Sync...");
        
        if (!MAIN_FOLDER) {
            return res.status(400).json({message: "MAIN_FOLDER env variable is not set."});
        }

        
        console.log("Locating GEDCOM file...");
        const response = await drive.files.list({
            q: `'${MAIN_FOLDER}' in parents and trashed = false and fileExtension = 'ged'`,
            fields: 'files(id, name)',
            pageSize: 1 
        });

        if (!response.data.files || response.data.files.length === 0) {
            return res.status(404).json({message: "GEDCOM file not found in main folder"});
        }

        const gedcomFileId = response.data.files[0].id;

        
        console.log("Wiping Bridge Tables...");
        await supabase.from("individual_publications").delete().neq("id", 0);
        await supabase.from("family_children").delete().neq("id", 0);

        
        const parsedIndividualIds = new Set();
        const parsedFamilyIds = new Set();
        const parsedPublicationIds = new Set();

        
        console.log("Downloading and Parsing GEDCOM...");
        const gedcomRes = await drive.files.get({ fileId: gedcomFileId, alt: 'media' }, { responseType: 'stream' });
        
        let gedcomData = '';
        await new Promise((resolve, reject) => {
            gedcomRes.data.on('data', chunk => gedcomData += chunk);
            gedcomRes.data.on('end', resolve);
            gedcomRes.data.on('error', reject);
        });

        const parsedData = parseGedcom.parse(gedcomData);
        const parsedNodes = Array.isArray(parsedData) ? parsedData : (parsedData.children || []);

        const individualsBatch = [];
        const familiesBatch = [];
        const familyChildrenBatch = [];

        for (const node of parsedNodes) {
            const tag = node.tag || node.type;
            if (tag === "INDI") {
                const pointer = node.pointer || (node.data && node.data.xref_id) || '';
                const id = pointer.replace(/@/g, '');
                parsedIndividualIds.add(id);
                
                let givenNames = '';
                let surname = '';
                let birthYear = null;
                const rawMeta = {};
                
                const childrenArray = node.tree || node.children || [];
                for (const child of childrenArray) {
                    const childTag = child.tag || child.type;
                    if (childTag === "NAME") {
                        const nameParts = (child.value || '').split('/');
                        givenNames = nameParts[0]?.trim() || '';
                        surname = nameParts[1]?.trim() || '';
                    } else if (childTag === "BIRT") {
                        const bChildren = child.tree || child.children || [];
                        for (const bChild of bChildren) {
                            const bChildTag = bChild.tag || bChild.type;
                            if (bChildTag === "DATE") {
                                const yearMatch = (bChild.value || '').match(/\d{4}/);
                                if (yearMatch) birthYear = parseInt(yearMatch[0]);
                            }
                        }
                    } else {
                        rawMeta[childTag] = child.value;
                    }
                }

                individualsBatch.push({
                    id,
                    given_names: givenNames,
                    surname,
                    birth_year_calculated: birthYear,
                    raw_metadata: rawMeta
                });
            } else if (tag === "FAM") {
                const pointer = node.pointer || (node.data && node.data.xref_id) || '';
                const id = pointer.replace(/@/g, '').trim();
                parsedFamilyIds.add(id);

                let husband_id = null;
                let wife_id = null;
                const rawMeta = {};
                const children = [];

                const childrenArray = node.tree || node.children || [];
                for (const child of childrenArray) {
                    const childTag = child.tag || child.type;
                    const childPointerStr = (child.data && child.data.pointer) || child.value || '';
                    if (childTag === "HUSB") husband_id = childPointerStr.replace(/@/g, '').trim();
                    else if (childTag === "WIFE") wife_id = childPointerStr.replace(/@/g, '').trim();
                    else if (childTag === "CHIL") {
                        const cid = childPointerStr.replace(/@/g, '').trim();
                        if (cid) children.push(cid);
                    }
                    else rawMeta[childTag] = child.value;
                }

                
                if (!husband_id || !parsedIndividualIds.has(husband_id)) husband_id = null;
                if (!wife_id || !parsedIndividualIds.has(wife_id)) wife_id = null;

                familiesBatch.push({ id, husband_id, wife_id, raw_metadata: rawMeta });
                
                for (const child_id of children) {
                    if (parsedIndividualIds.has(child_id)) {
                        familyChildrenBatch.push({
                            family_id: id,
                            child_id,
                            relationship_type: 'biological'
                        });
                    }
                }
            }
        }

        console.log(`Upserting ${individualsBatch.length} individuals, ${familiesBatch.length} families...`);
        
        
        if (individualsBatch.length > 0) {
            for (const chunk of chunkArray(individualsBatch, 500)) {
                const { error } = await supabase.from('individuals').upsert(chunk);
                if (error) throw new Error("Individuals Upsert Error: " + error.message);
            }
        }
        if (familiesBatch.length > 0) {
            for (const chunk of chunkArray(familiesBatch, 500)) {
                const { error } = await supabase.from('families').upsert(chunk);
                if (error) throw new Error("Families Upsert Error: " + error.message);
            }
        }
        if (familyChildrenBatch.length > 0) {
            for (const chunk of chunkArray(familyChildrenBatch, 500)) {
                const { error } = await supabase.from('family_children').insert(chunk);
                if (error) throw new Error("Family Children Insert Error: " + error.message);
            }
        }

        
        if (PROFILE_PHOTOS) {
            console.log("Processing Profile Photos...");
            const photosRes = await drive.files.list({
                q: `'${PROFILE_PHOTOS}' in parents and trashed = false`,
                fields: 'files(id, name)'
            });
            const photos = photosRes.data.files;
            for (const photo of photos) {
                const match = photo.name.match(/^(I\d+)\./);
                if (match) {
                    const individualId = match[1];
                    if (parsedIndividualIds.has(individualId)) {
                        await supabase.from('individuals').update({ profile_media_id: photo.id }).eq('id', individualId);
                    }
                }
            }
        }

        
        const publicationsBatch = [];
        const individualPubsBatch = [];

        if (HISTORICAL_DOCS) {
            console.log("Processing Historical Docs...");
            const docsRes = await drive.files.list({
                q: `'${HISTORICAL_DOCS}' in parents and trashed = false`,
                fields: 'files(id, name)'
            });
            const docs = docsRes.data.files;
            for (const doc of docs) {
                const match = doc.name.match(/^(I\d+)_(.+)\./);
                if (match) {
                    const individualId = match[1];
                    const title = match[2];
                    const pubId = `PUB_${doc.id}`;
                    
                    parsedPublicationIds.add(pubId);

                    publicationsBatch.push({
                        id: pubId,
                        title,
                        gdrive_file_id: doc.id
                    });
                    
                    individualPubsBatch.push({
                        individual_id: individualId,
                        publication_id: pubId,
                        contribution_type: 'subject'
                    });
                }
            }
        }

        
        if (LITERACY_WORKS) {
            console.log("Processing Literary Works...");
            const litWorksRes = await drive.files.list({
                q: `'${LITERACY_WORKS}' in parents and trashed = false`,
                fields: 'files(id, name)'
            });
            const litFiles = litWorksRes.data.files;
            const jsonFile = litFiles.find(f => f.name === 'publications.json');
            
            if (jsonFile) {
                const jsonRes = await drive.files.get({ fileId: jsonFile.id, alt: 'media' }, { responseType: 'stream' });
                let jsonDataStr = '';
                await new Promise((resolve, reject) => {
                    jsonRes.data.on('data', chunk => jsonDataStr += chunk);
                    jsonRes.data.on('end', resolve);
                    jsonRes.data.on('error', reject);
                });
                
                let libraryData = [];
                try {
                    
                    libraryData = JSON.parse(jsonDataStr);
                } catch (jsonError) {
                    console.warn("WARNING: publications.json is malformed. Skipping Literary Works sync.");
                }

                for (const item of libraryData) {
                    parsedPublicationIds.add(item.id);

                    publicationsBatch.push({
                        id: item.id,
                        title: item.title,
                        publication_year: item.publication_year || null,
                        publisher: item.publisher || null,
                        description: item.description || null,
                        
                        gdrive_file_id: item.gdrive_file_id || null 
                    });

                    if (item.author_ids && Array.isArray(item.author_ids)) {
                        for (const authorId of item.author_ids) {
                            individualPubsBatch.push({
                                individual_id: authorId,
                                publication_id: item.id,
                                contribution_type: 'author'
                            });
                        }
                    }
                }
            }
        }

        console.log(`Upserting ${publicationsBatch.length} publications...`);
        
        if (publicationsBatch.length > 0) {
            for (const chunk of chunkArray(publicationsBatch, 500)) {
                await supabase.from('publications').upsert(chunk);
            }
        }
        if (individualPubsBatch.length > 0) {
            for (const chunk of chunkArray(individualPubsBatch, 500)) {
                await supabase.from('individual_publications').insert(chunk);
            }
        }

        
        console.log("Pruning old data...");
        
        const pruneTable = async (tableName, parsedSet) => {
            const { data } = await supabase.from(tableName).select('id');
            if (data) {
                const existingIds = data.map(r => r.id);
                const idsToDelete = existingIds.filter(id => !parsedSet.has(id));
                if (idsToDelete.length > 0) {
                    console.log(`Deleting ${idsToDelete.length} records from ${tableName}...`);
                    for (let i = 0; i < idsToDelete.length; i += 100) {
                        const chunk = idsToDelete.slice(i, i + 100);
                        await supabase.from(tableName).delete().in('id', chunk);
                    }
                }
            }
        };

        await pruneTable('individuals', parsedIndividualIds);
        await pruneTable('families', parsedFamilyIds);
        await pruneTable('publications', parsedPublicationIds);

        console.log("Sync Complete!");
        res.status(200).json({ message: "Sync complete successfully!" });
    }
    catch(err){
        console.error(err);
        res.status(500).json({message: "Internal server error", error: err.message})
    }
});
router.put("/sync-media", async (req, res) => {
    try {
        console.log("Starting Media Sync..."); 

        
        if (!PROFILE_PHOTOS || !HISTORICAL_DOCS || !LITERACY_WORKS) {
            console.log("Missing Google Drive folder IDs in environment variables.");
        }

        const processFolder = async (folderId, type) => {
            if (!folderId) return;
            let pageToken = null;
            do {
                const response = await drive.files.list({
                    q: `'${folderId}' in parents and trashed = false`,
                    fields: 'nextPageToken, files(id, name, mimeType, webViewLink)',
                    pageToken: pageToken
                });
                
                const files = response.data.files;
                if (!files) break;

                
                let mappingJson = null;
                const jsonFile = files.find(f => f.mimeType === 'application/json' || f.name.endsWith('.json'));
                if (jsonFile) {
                    const jsonRes = await drive.files.get({ fileId: jsonFile.id, alt: 'media' }, { responseType: 'json' });
                    mappingJson = jsonRes.data;
                }

                for (const file of files) {
                    if (file.mimeType === 'application/json' || file.name.endsWith('.json')) continue;
                    
                    
                    const idMatch = file.name.match(/I\d+/);
                    const sharingUrl = file.webViewLink || `https://drive.google.com/file/d/${file.id}/view?usp=sharing`;
                    
                    if (type === 'PROFILE_PHOTOS' && idMatch) {
                        const id = idMatch[0];
                        const { error } = await supabase.from("individuals")
                            .update({ googleurl: sharingUrl })
                            .eq("id", id);
                        if (error) console.error(`Error updating ${id}:`, error);
                    } else if (type === 'HISTORICAL_DOCS' || type === 'LITERACY_WORKS') {
                        if (idMatch) {
                            const id = idMatch[0];
                            const { data: ind } = await supabase.from("individuals").select("raw_metadata, relativelinks").eq("id", id).single();
                            if (ind) {
                                
                                const meta = ind.raw_metadata || {};
                                if (!meta.historical_docs) meta.historical_docs = [];
                                if (!meta.historical_docs.some(d => d.id === file.id)) {
                                    meta.historical_docs.push({ id: file.id, name: file.name, url: sharingUrl });
                                }
                                
                                const relLinks = Array.isArray(ind.relativelinks) ? [...ind.relativelinks] : [];
                                const linkExists = relLinks.some(r => {
                                    if (typeof r === 'string') return r === sharingUrl;
                                    return r.url === sharingUrl || r.title === file.name;
                                });
                                if (!linkExists) {
                                    relLinks.push({ url: sharingUrl, title: file.name, type: 'Historical Document' });
                                }

                                const { error: histError } = await supabase.from("individuals").update({ 
                                    relativelinks: relLinks 
                                }).eq("id", id);
                                if (histError) console.error(`Error updating hist docs for ${id}:`, histError);
                            }
                        } else if (mappingJson && Array.isArray(mappingJson)) {
                            
                            
                            const baseName = file.name.split('.')[0];
                            const mapEntry = mappingJson.find(m => m.id === baseName);
                            if (mapEntry) {
                                await supabase.from("publications").upsert({
                                    id: mapEntry.id,
                                    title: mapEntry.title || file.name,
                                    publication_year: mapEntry.publication_year || null,
                                    publisher: mapEntry.publisher || '',
                                    description: mapEntry.description || '',
                                    gdrive_file_id: file.id
                                });
                                
                                const individualsList = Array.isArray(mapEntry.author_ids) ? mapEntry.author_ids : (Array.isArray(mapEntry.individuals) ? mapEntry.individuals : null);
                                if (individualsList) {
                                    for (const indId of individualsList) {
                                        await supabase.from("individual_publications").upsert({
                                            individual_id: indId,
                                            publication_id: mapEntry.id,
                                            contribution_type: mapEntry.contribution_type || 'subject'
                                        }); 
                                        
                                        
                                        const { data: ind } = await supabase.from("individuals").select("relativelinks").eq("id", indId).single();
                                        if (ind) {
                                            const relLinks = Array.isArray(ind.relativelinks) ? [...ind.relativelinks] : [];
                                            const linkExists = relLinks.some(r => {
                                                if (typeof r === 'string') return r === sharingUrl;
                                                const newTitle = mapEntry.title || file.name;
                                                return r.url === sharingUrl || r.title === newTitle;
                                            });
                                            if (!linkExists) {
                                                relLinks.push({ url: sharingUrl, title: mapEntry.title || file.name, type: 'Literacy Work' });
                                                await supabase.from("individuals").update({ relativelinks: relLinks }).eq("id", indId);
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
                pageToken = response.data.nextPageToken;
            } while (pageToken);
        };

        console.log("Processing Profile Photos...");
        await processFolder(PROFILE_PHOTOS, 'PROFILE_PHOTOS');
        console.log("Processing Historical Docs...");
        await processFolder(HISTORICAL_DOCS, 'HISTORICAL_DOCS');
        console.log("Processing Literary Works...");
        await processFolder(LITERACY_WORKS, 'LITERACY_WORKS');

        console.log("Media Sync Complete!");
        res.status(200).json({ message: "Media Sync complete successfully!" });
    } catch(err) {
        console.error("Media Sync Error:", err);
        res.status(500).json({message: "Internal server error", error: err.message});
    }
});

router.get("/geting", async (req, res) => {
    try {
        const { data, error } = await supabase.from("individuals").select("*").order("id");
        if (error) throw error;
        res.status(200).json({ data });
    } catch (err) {
        console.error(err);
        res.status(500).json({message: "Internal server error", error: err.message});
    }
});

module.exports = router;