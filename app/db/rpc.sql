CREATE OR REPLACE FUNCTION get_family_tree(
    p_start_person_id VARCHAR,
    p_max_depth INT,
    p_direction VARCHAR
)
RETURNS JSON AS $$
DECLARE
    result JSON;
BEGIN
    IF p_direction = 'up' THEN
        WITH RECURSIVE
        -- 1. Traverse up to find all ancestors up to max_depth
        ancestors AS (
            -- Base case: the start person and their parent families
            SELECT
                p_start_person_id AS person_id,
                fc.family_id AS parent_family_id,
                0 AS depth
            FROM individuals i
            LEFT JOIN family_children fc ON i.id = fc.child_id
            WHERE i.id = p_start_person_id

            UNION

            -- Recursive step: parents' parent families
            SELECT
                parent_id,
                fc.family_id AS parent_family_id,
                a.depth + 1
            FROM ancestors a
            JOIN families f ON a.parent_family_id = f.id
            JOIN LATERAL (
                SELECT f.husband_id AS parent_id WHERE f.husband_id IS NOT NULL
                UNION
                SELECT f.wife_id AS parent_id WHERE f.wife_id IS NOT NULL
            ) p ON true
            LEFT JOIN family_children fc ON p.parent_id = fc.child_id
            WHERE a.depth < p_max_depth AND parent_id IS NOT NULL
        ),
        core_persons AS (
            SELECT DISTINCT person_id FROM ancestors WHERE person_id IS NOT NULL
        ),
        -- 2. Expand to include spouses and siblings to form complete family units
        related_families AS (
            SELECT id AS family_id FROM families WHERE husband_id IN (SELECT person_id FROM core_persons)
            UNION
            SELECT id AS family_id FROM families WHERE wife_id IN (SELECT person_id FROM core_persons)
            UNION
            SELECT parent_family_id FROM ancestors WHERE parent_family_id IS NOT NULL
        ),
        all_persons AS (
            SELECT person_id FROM core_persons
            UNION
            SELECT husband_id FROM families WHERE id IN (SELECT family_id FROM related_families) AND husband_id IS NOT NULL
            UNION
            SELECT wife_id FROM families WHERE id IN (SELECT family_id FROM related_families) AND wife_id IS NOT NULL
            UNION
            SELECT child_id FROM family_children WHERE family_id IN (SELECT family_id FROM related_families) AND child_id IS NOT NULL
        )
        SELECT json_build_object(
            'individuals', (SELECT COALESCE(json_agg(row_to_json(i)), '[]'::json) FROM individuals i WHERE id IN (SELECT person_id FROM all_persons)),
            'families', (SELECT COALESCE(json_agg(row_to_json(f)), '[]'::json) FROM families f WHERE id IN (SELECT family_id FROM related_families)),
            'family_children', (SELECT COALESCE(json_agg(row_to_json(fc)), '[]'::json) FROM family_children fc WHERE family_id IN (SELECT family_id FROM related_families) AND child_id IN (SELECT person_id FROM all_persons))
        ) INTO result;

    ELSE
        -- 1. Traverse down to find all descendants up to max_depth
        WITH RECURSIVE
        descendants AS (
            -- Base case: the start person and families where they are parents
            SELECT
                p_start_person_id AS person_id,
                f.id AS spouse_family_id,
                0 AS depth
            FROM individuals i
            LEFT JOIN families f ON f.husband_id = i.id OR f.wife_id = i.id
            WHERE i.id = p_start_person_id

            UNION

            -- Recursive step: children and families where they are parents
            SELECT
                fc.child_id AS person_id,
                f.id AS spouse_family_id,
                d.depth + 1
            FROM descendants d
            JOIN family_children fc ON d.spouse_family_id = fc.family_id
            LEFT JOIN families f ON f.husband_id = fc.child_id OR f.wife_id = fc.child_id
            WHERE d.depth < p_max_depth AND fc.child_id IS NOT NULL
        ),
        core_persons AS (
            SELECT DISTINCT person_id FROM descendants WHERE person_id IS NOT NULL
        ),
        related_families AS (
            SELECT spouse_family_id AS family_id FROM descendants WHERE spouse_family_id IS NOT NULL
            UNION
            SELECT id AS family_id FROM families WHERE husband_id IN (SELECT person_id FROM core_persons)
            UNION
            SELECT id AS family_id FROM families WHERE wife_id IN (SELECT person_id FROM core_persons)
        ),
        all_persons AS (
            SELECT person_id FROM core_persons
            UNION
            SELECT husband_id FROM families WHERE id IN (SELECT family_id FROM related_families) AND husband_id IS NOT NULL
            UNION
            SELECT wife_id FROM families WHERE id IN (SELECT family_id FROM related_families) AND wife_id IS NOT NULL
            UNION
            SELECT child_id FROM family_children WHERE family_id IN (SELECT family_id FROM related_families) AND child_id IS NOT NULL
        )
        SELECT json_build_object(
            'individuals', (SELECT COALESCE(json_agg(row_to_json(i)), '[]'::json) FROM individuals i WHERE id IN (SELECT person_id FROM all_persons)),
            'families', (SELECT COALESCE(json_agg(row_to_json(f)), '[]'::json) FROM families f WHERE id IN (SELECT family_id FROM related_families)),
            'family_children', (SELECT COALESCE(json_agg(row_to_json(fc)), '[]'::json) FROM family_children fc WHERE family_id IN (SELECT family_id FROM related_families) AND child_id IN (SELECT person_id FROM all_persons))
        ) INTO result;
    END IF;

    RETURN result;
END;
$$ LANGUAGE plpgsql;
