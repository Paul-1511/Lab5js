document.addEventListener("DOMContentLoaded", () => {
    const postList = document.getElementById("postList");
    const searchBar = document.getElementById("searchBar");
    const commentInput = document.getElementById("commentInput");
    const commentsDiv = document.getElementById("comments");
    let posts = [];

    // Obtener productos de la API de Fake Store
    async function fetchPosts() {
        try {
            const response = await fetch("https://fakestoreapi.com/products");
            const data = await response.json();

            console.log("Datos recibidos:", data); // Depuración

            posts = data.map(product => ({
                id: product.id,
                title: product.title,
                content: `Precio: $${product.price} | Categoría: ${product.category}`,
                image: product.image
            }));

            renderPosts(posts);
        } catch (error) {
            console.error("Error al obtener productos:", error);
            postList.innerHTML = "<p style='color: red;'>Error al cargar los productos. Intenta de nuevo.</p>";
        }
    }

    // Renderizar productos en la pantalla
    function renderPosts(filteredPosts) {
        postList.innerHTML = "";
        
        if (filteredPosts.length === 0) {
            postList.innerHTML = "<p>No se encontraron productos.</p>";
            return;
        }

        filteredPosts.forEach(post => {
            console.log("Renderizando:", post); // Depuración

            const postCard = document.createElement("div");
            postCard.className = "post-card";
            postCard.innerHTML = `
                <h3>${post.title}</h3>
                <p>${post.content}</p>
                <img src="${post.image}" alt="${post.title}" style="max-width: 100px;"/>
            `;
            postCard.addEventListener("click", () => alert("Producto seleccionado: " + post.title));
            postList.appendChild(postCard);
        });
    }

    // Filtrar productos en tiempo real
    searchBar.addEventListener("input", (e) => {
        const searchText = e.target.value.toLowerCase();
        const filtered = posts.filter(post => post.title.toLowerCase().includes(searchText));
        renderPosts(filtered);
    });

    // Agregar comentarios con Enter
    commentInput.addEventListener("keydown", (e) => {
        if (e.key === "Enter" && commentInput.value.trim() !== "") {
            const comment = document.createElement("p");
            let text = commentInput.value;

            comment.innerText = text;

            // Detectar si el comentario es un enlace a una imagen
            if (text.match(/(https?:\/\/.*\.(?:png|jpg|jpeg|gif))/i)) {
                const img = document.createElement("img");
                img.src = text;
                img.className = "preview";
                img.style.width = "100px";
                img.style.display = "block";
                img.style.marginTop = "10px";
                comment.appendChild(img);
            }

            commentsDiv.appendChild(comment);
            commentInput.value = "";
            commentsDiv.scrollTop = commentsDiv.scrollHeight;
        }
    });

    // Cargar los productos al iniciar
    fetchPosts();
});
