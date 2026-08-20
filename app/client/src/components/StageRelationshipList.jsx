import { Link } from "react-router";

function StageRelationshipList({
  title,
  emptyMessage,
  relations,
  direction,
}) {
  return (
    <section>
      <h3>{title}</h3>

      {relations.length === 0 ? (
        <p className="muted-text">
          {emptyMessage}
        </p>
      ) : (
        <div className="stage-profile-relation-list">
          {relations.map((relation) => (
            <article
              className={`stage-profile-relation ${
                relation.is_archived === 1
                  ? "archived-relation-item"
                  : ""
              }`}
              key={relation.relation_id}
            >
              <div className="stage-profile-relation-heading">
                <span className="stage-relation-arrow">
                  {direction === "incoming"
                    ? "→"
                    : "→"}
                </span>

                <Link to={`/stages/${relation.id}`}>
                  {relation.code}
                </Link>

                {relation.is_archived === 1 && (
                  <span className="archive-badge">
                    Archived
                  </span>
                )}
              </div>

              <div className="stage-relation-details">
                <span className="relation-category-badge">
                  {relation.relation_type}
                </span>

                <span className="muted-text">
                  {relation.lineage_code}
                  {" · "}
                  {relation.age_code}
                </span>
              </div>

              {relation.name && (
                <p className="stage-profile-relation-name">
                  {relation.name}
                </p>
              )}

              {relation.relationship_notes && (
                <p className="relationship-note">
                  {relation.relationship_notes}
                </p>
              )}
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

export default StageRelationshipList;