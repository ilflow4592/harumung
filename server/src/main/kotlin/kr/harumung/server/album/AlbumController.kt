package kr.harumung.server.album

import org.springframework.http.HttpStatus
import org.springframework.stereotype.Controller
import org.springframework.ui.Model
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.ResponseStatus

/** 보호자 앨범 웹 페이지. 토큰만으로 열람. 실제 조회는 3주차에 붙인다. */
@Controller
class AlbumController {

    @GetMapping("/a/{token}")
    fun album(@PathVariable token: String, model: Model): String {
        if (token.length != 32) throw AlbumNotFound()
        model.addAttribute("token", token)
        return "album"
    }
}

@ResponseStatus(HttpStatus.NOT_FOUND)
class AlbumNotFound : RuntimeException("앨범이 없거나 만료되었습니다.")
